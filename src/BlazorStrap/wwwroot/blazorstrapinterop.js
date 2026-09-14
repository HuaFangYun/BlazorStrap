// { id = [{ creating element, eventtype, func}] }
let eventCallbacks = [];
let documentEventsSet = false;
let docuemntEventId = [];
let link;
let collapseToggleSetup = false;
let dotnetRef = null;
let collapseAnimating = {}; // Track which collapses are mid-animation
let collapseSyncDebounce = {}; // Debounce Blazor sync per collapse

// Optimistic UI tracking for dropdowns
let dropdownAnimating = {};
let dropdownSyncDebounce = {};
let openDropdowns = {}; // Track currently open dropdowns for click-outside handling
let hoverDropdowns = {}; // Track which dropdowns were opened via hover (vs click)
let hoverCloseTimeout = {}; // Delay before closing hover dropdowns


// Setup optimistic click handlers for collapse and dropdown toggles
// This allows JS to handle UI immediately without waiting for Blazor Server round-trip
export function setupCollapseToggles(dotnet) {
    if (collapseToggleSetup) return;
    dotnetRef = dotnet;

    // Click-outside-to-close. Registered first so it runs before the toggle handler
    // below, which stops propagation and would otherwise hide the click from it.
    setupDropdownClickOutside();

    document.addEventListener('click', async function(e) {
        // Guard: e.target might be a text node or other non-Element
        if (!e.target || typeof e.target.closest !== 'function') return;

        // Find the toggle element (could be the target or an ancestor)
        const collapseToggle = e.target.closest('[data-bs-toggle="collapse"][data-blazorstrap-target]');
        // Exclude hover dropdowns (data-bs-hover="true") - they only respond to hover, not click
        const dropdownToggle = e.target.closest('[data-bs-toggle="dropdown"][data-blazorstrap-target]:not([data-bs-hover="true"])');

        if (collapseToggle) {
            await handleCollapseToggle(e, collapseToggle);
        } else if (dropdownToggle) {
            await handleDropdownToggle(e, dropdownToggle);
        }
    }, true); // Use capture to intercept before Blazor

    // Setup hover handlers for dropdowns (IsMouseover)
    setupDropdownHoverHandlers();

    collapseToggleSetup = true;
}

// Handle hover dropdowns (IsMouseover parameter)
function setupDropdownHoverHandlers() {
    // Mouseenter on toggle - show dropdown
    document.addEventListener('mouseenter', function(e) {
        if (!e.target || typeof e.target.closest !== 'function') return;

        // Look for dropdown toggle that is hover-enabled
        // The toggle has data-blazorstrap (its own ID) and data-blazorstrap-target (dropdown ID)
        const toggle = e.target.closest('[data-bs-toggle="dropdown"][data-blazorstrap-target][data-bs-hover="true"]');
        if (!toggle) return;

        const targetId = toggle.getAttribute('data-blazorstrap-target');
        if (!targetId) return;

        const dropdown = document.querySelector('[data-blazorstrap="' + targetId + '"]');
        if (!dropdown) return;

        // Cancel any pending close
        if (hoverCloseTimeout[targetId]) {
            clearTimeout(hoverCloseTimeout[targetId]);
            delete hoverCloseTimeout[targetId];
        }

        // Show dropdown immediately
        if (!dropdown.classList.contains('show')) {
            showDropdownOptimistic(targetId, toggle, dropdown, true); // true = hover
        }
    }, true);

    // Also cancel close timeout when entering the dropdown menu itself
    document.addEventListener('mouseenter', function(e) {
        if (!e.target || typeof e.target.closest !== 'function') return;

        const dropdownMenu = e.target.closest('.dropdown-menu[data-blazorstrap]');
        if (!dropdownMenu) return;

        const targetId = dropdownMenu.getAttribute('data-blazorstrap');
        if (!targetId || !hoverDropdowns[targetId]) return;

        // Cancel any pending close
        if (hoverCloseTimeout[targetId]) {
            clearTimeout(hoverCloseTimeout[targetId]);
            delete hoverCloseTimeout[targetId];
        }
    }, true);

    // Mouseleave - hide dropdown when leaving both toggle and menu (with delay)
    document.addEventListener('mouseleave', function(e) {
        if (!e.target || typeof e.target.closest !== 'function') return;

        const toggle = e.target.closest('[data-bs-toggle="dropdown"][data-blazorstrap-target][data-bs-hover="true"]');
        const dropdownMenu = e.target.closest('.dropdown-menu[data-blazorstrap]');

        let targetId = null;
        let dropdown = null;
        let toggleEl = null;

        if (toggle) {
            targetId = toggle.getAttribute('data-blazorstrap-target');
            dropdown = document.querySelector('[data-blazorstrap="' + targetId + '"]');
            toggleEl = toggle;
        } else if (dropdownMenu) {
            targetId = dropdownMenu.getAttribute('data-blazorstrap');
            dropdown = dropdownMenu;
            toggleEl = document.querySelector('[data-blazorstrap-target="' + targetId + '"]');
        }

        if (!targetId || !dropdown || !toggleEl) return;

        // Only handle hover-opened dropdowns
        if (!hoverDropdowns[targetId]) return;

        // Check if moving to the other element (toggle <-> dropdown)
        const movingToToggle = toggleEl.contains(e.relatedTarget) || toggleEl === e.relatedTarget;
        const movingToDropdown = dropdown.contains(e.relatedTarget) || dropdown === e.relatedTarget;

        if (!movingToToggle && !movingToDropdown) {
            // Delay before closing to give user time to move to the menu
            if (hoverCloseTimeout[targetId]) {
                clearTimeout(hoverCloseTimeout[targetId]);
            }
            hoverCloseTimeout[targetId] = setTimeout(() => {
                delete hoverCloseTimeout[targetId];
                // Double-check mouse isn't over toggle or dropdown now
                if (dropdown.classList.contains('show')) {
                    hideDropdownOptimistic(targetId, toggleEl, dropdown);
                }
            }, 150); // 150ms delay to allow moving to menu
        }
    }, true);
}

// Setup click-outside-to-close for dropdowns
function setupDropdownClickOutside() {
    // Capture phase: handleDropdownToggle() calls stopPropagation(), so a bubble-phase
    // listener never sees clicks that land on a toggle - which is exactly the case that
    // has to close the *other* open menus (a sibling submenu, or a different nav item).
    // Runs before the toggle handler, so the menu being opened is not closed again.
    document.addEventListener('click', function(e) {
        if (!e.target || typeof e.target.closest !== 'function') return;
        closeDropdownsOutside(e.target);
    }, true);
}

// Close every open dropdown that the given element is not inside of.
// A dropdown is kept when the element is inside its menu (that includes the togglers of
// nested submenus, so opening a submenu doesn't close its parents) or inside its own
// toggle (so handleDropdownToggle can toggle it closed instead of us closing + reopening).
function closeDropdownsOutside(target) {
    for (const targetId in openDropdowns) {
        const entry = openDropdowns[targetId];
        if (!entry) continue;
        const { toggle, dropdown } = entry;

        // Drop entries whose element is gone or was closed by someone else (e.g. Blazor
        // hiding the dropdown when a BSDropdownItem was clicked).
        if (!dropdown.isConnected || !dropdown.classList.contains('show')) {
            delete openDropdowns[targetId];
            delete hoverDropdowns[targetId];
            continue;
        }

        if (toggle === target || toggle.contains(target)) continue;
        if (dropdown === target || dropdown.contains(target)) continue;

        hideDropdownOptimistic(targetId, toggle, dropdown);
    }
}

// Close open dropdowns that are not ancestors of the one being opened.
function closeDropdownsExceptAncestorsOf(toggle, dropdown) {
    for (const targetId in openDropdowns) {
        const entry = openDropdowns[targetId];
        if (!entry) continue;
        if (entry.dropdown === dropdown) continue;
        if (toggle && (entry.dropdown.contains(toggle) || entry.toggle.contains(toggle))) continue;
        hideDropdownOptimistic(targetId, entry.toggle, entry.dropdown);
    }
}

// Show dropdown optimistically (shared by click and hover)
// isHover: true if opened via hover, false if opened via click
function showDropdownOptimistic(targetId, toggle, dropdown, isHover = false) {
    if (dropdownAnimating[targetId]) return;

    // Only one branch of the menu tree stays open at a time.
    closeDropdownsExceptAncestorsOf(toggle, dropdown);

    dropdown.classList.add('show');
    toggle.setAttribute('aria-expanded', 'true');

    // Track as open
    openDropdowns[targetId] = { toggle, dropdown };

    if (isHover) {
        // Track that this was opened via hover
        // Don't sync to Blazor - hover dropdowns are purely JS-driven to avoid flicker
        hoverDropdowns[targetId] = true;
    } else {
        // For click dropdowns, sync to Blazor immediately
        if (dotnetRef) {
            dotnetRef.invokeMethodAsync('SyncDropdownState', targetId, true);
        }
    }
}

// Hide dropdown optimistically (shared by click, hover, and click-outside)
function hideDropdownOptimistic(targetId, toggle, dropdown) {
    if (dropdownAnimating[targetId]) return;

    // Close submenus nested inside this one, otherwise they stay open (and tracked) and
    // are still showing the next time the parent is opened.
    for (const childId in openDropdowns) {
        if (childId === targetId) continue;
        const child = openDropdowns[childId];
        if (!child) continue;
        if (dropdown.contains(child.toggle) || dropdown.contains(child.dropdown)) {
            hideDropdownOptimistic(childId, child.toggle, child.dropdown);
        }
    }

    dropdown.classList.remove('show');
    toggle.setAttribute('aria-expanded', 'false');

    // Check if this was a hover dropdown before cleaning up
    const wasHover = hoverDropdowns[targetId];

    // Remove from open tracking
    delete openDropdowns[targetId];

    // Clean up hover tracking
    delete hoverDropdowns[targetId];
    if (hoverCloseTimeout[targetId]) {
        clearTimeout(hoverCloseTimeout[targetId]);
        delete hoverCloseTimeout[targetId];
    }

    // Clean up mouse tracking
    stopMouseTracking(targetId);
    delete componentSyncState[targetId];

    // Only sync to Blazor for click dropdowns, not hover
    // Hover dropdowns are purely JS-driven to avoid flicker
    if (!wasHover && dotnetRef) {
        dotnetRef.invokeMethodAsync('SyncDropdownState', targetId, false);
    }
}

// Track component state for sync decisions
let componentSyncState = {};

// Handle collapse toggle clicks
async function handleCollapseToggle(e, toggle) {
    const targetId = toggle.getAttribute('data-blazorstrap-target');
    if (!targetId) return;

    const collapse = document.querySelector('[data-blazorstrap="' + targetId + '"]');
    if (!collapse) return;

    // Always prevent default/propagation for collapse toggles
    e.preventDefault();
    e.stopPropagation();

    // Skip if animation already in progress for this collapse
    if (collapseAnimating[targetId]) return;

    // Mark as animating and cancel any pending Blazor sync
    collapseAnimating[targetId] = true;
    if (collapseSyncDebounce[targetId]) {
        clearTimeout(collapseSyncDebounce[targetId]);
        delete collapseSyncDebounce[targetId];
    }

    // Initialize sync state tracking
    if (!componentSyncState[targetId]) {
        componentSyncState[targetId] = { animationComplete: false, mouseLeft: false };
    }
    componentSyncState[targetId].animationComplete = false;
    componentSyncState[targetId].mouseLeft = false;

    // Determine if horizontal collapse
    const isHorizontal = collapse.classList.contains('collapse-horizontal');

    // Determine the new state and optimistically update UI
    const willShow = !collapse.classList.contains('show');

    // Start mouse tracking
    startMouseTracking(targetId, toggle, collapse, 'collapse');

    try {
        if (willShow) {
            await showCollapse(collapse, isHorizontal, dotnetRef);
        } else {
            await hideCollapse(collapse, isHorizontal, dotnetRef);
        }
    } finally {
        // Small delay before allowing new animations (prevents rapid re-triggering)
        await new Promise(resolve => setTimeout(resolve, 50));
        delete collapseAnimating[targetId];

        // Mark animation complete and try to sync
        componentSyncState[targetId].animationComplete = true;
        trySync(targetId, collapse, 'collapse');
    }
}

// Track mouse state for components
let mouseTrackingState = {};

// Handle dropdown toggle clicks
async function handleDropdownToggle(e, toggle) {
    const targetId = toggle.getAttribute('data-blazorstrap-target');
    if (!targetId) return;

    const dropdown = document.querySelector('[data-blazorstrap="' + targetId + '"]');
    if (!dropdown) return;

    // Always prevent default/propagation for dropdown toggles
    e.preventDefault();
    e.stopPropagation();

    // Skip if already processing this dropdown
    if (dropdownAnimating[targetId]) return;

    // Determine the new state and optimistically update UI
    const willShow = !dropdown.classList.contains('show');

    if (willShow) {
        showDropdownOptimistic(targetId, toggle, dropdown);
    } else {
        hideDropdownOptimistic(targetId, toggle, dropdown);
    }

    // Mark as animating AFTER show/hide to prevent rapid re-triggering
    dropdownAnimating[targetId] = true;
    await new Promise(resolve => setTimeout(resolve, 50));
    delete dropdownAnimating[targetId];
}

// Unified mouse tracking for all components
function startMouseTracking(targetId, toggle, target, componentType) {
    // Stop any existing tracking
    stopMouseTracking(targetId);

    const trackingState = {
        toggle: toggle,
        target: target,
        componentType: componentType,
        leaveTimeout: null
    };

    const checkMouseLeave = (e) => {
        // Check if mouse is still over toggle or target
        const overToggle = toggle.contains(e.relatedTarget) || toggle === e.relatedTarget;
        const overTarget = target.contains(e.relatedTarget) || target === e.relatedTarget;

        if (!overToggle && !overTarget) {
            // Small delay before marking as left (in case mouse re-enters)
            if (trackingState.leaveTimeout) clearTimeout(trackingState.leaveTimeout);
            trackingState.leaveTimeout = setTimeout(() => {
                if (componentSyncState[targetId]) {
                    componentSyncState[targetId].mouseLeft = true;
                    trySync(targetId, target, componentType);
                }
            }, 100);
        }
    };

    const checkMouseEnter = (e) => {
        // Mouse re-entered, cancel the leave timeout
        if (trackingState.leaveTimeout) {
            clearTimeout(trackingState.leaveTimeout);
            trackingState.leaveTimeout = null;
        }
        if (componentSyncState[targetId]) {
            componentSyncState[targetId].mouseLeft = false;
        }
    };

    trackingState.leaveHandler = checkMouseLeave;
    trackingState.enterHandler = checkMouseEnter;

    toggle.addEventListener('mouseleave', checkMouseLeave);
    target.addEventListener('mouseleave', checkMouseLeave);
    toggle.addEventListener('mouseenter', checkMouseEnter);
    target.addEventListener('mouseenter', checkMouseEnter);

    mouseTrackingState[targetId] = trackingState;
}

// Stop mouse tracking for a component
function stopMouseTracking(targetId) {
    const trackingState = mouseTrackingState[targetId];
    if (!trackingState) return;

    if (trackingState.leaveTimeout) {
        clearTimeout(trackingState.leaveTimeout);
    }

    trackingState.toggle.removeEventListener('mouseleave', trackingState.leaveHandler);
    trackingState.target.removeEventListener('mouseleave', trackingState.leaveHandler);
    trackingState.toggle.removeEventListener('mouseenter', trackingState.enterHandler);
    trackingState.target.removeEventListener('mouseenter', trackingState.enterHandler);

    delete mouseTrackingState[targetId];
}

// Try to sync to Blazor - only syncs when both animation complete AND mouse left
function trySync(targetId, element, componentType) {
    const state = componentSyncState[targetId];
    if (!state) return;

    // Only sync when both conditions are met
    if (!state.animationComplete || !state.mouseLeft) return;

    // Clean up tracking
    stopMouseTracking(targetId);
    delete componentSyncState[targetId];

    // Get current DOM state and sync to Blazor
    const currentState = element.classList.contains('show');

    if (dotnetRef) {
        if (componentType === 'collapse') {
            dotnetRef.invokeMethodAsync('SyncCollapseState', targetId, currentState);
        } else if (componentType === 'dropdown') {
            dotnetRef.invokeMethodAsync('SyncDropdownState', targetId, currentState);
        }
    }
}

// Common
export async function checkBackdrops(dotnet) {
    var backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
        var openModals = document.querySelectorAll('.modal.show');
        //Checks to see if any other modal is open if so do not remove the backdrop
        if (openModals.length == 0) {

            await waitForTransitionEnd(backdrop, function () {
                backdrop.classList.remove("show");
            });
            await dotnet.invokeMethodAsync('RemoveBackdropAsync');
        }
    }
    backdrop = document.querySelector('.offcanvas-backdrop');
    if (backdrop) {
        var openOffcanvas = document.querySelectorAll('.offcanvas.show');
        //Checks to see if any other offcanvas is open if so do not remove the backdrop
        if (openOffcanvas.length == 0) {
            await waitForTransitionEnd(backdrop, function () {
                backdrop.classList.remove("show");
            });
            await dotnet.invokeMethodAsync('RemoveOffCanvasBackdropAsync');
        }
    }
}
export async function removeRougeEvents() {
    // remove any event and event handler that no longer exists you will have to loop because we need to unregister the event
    var documentCallbacks = eventCallbacks.find(x => x.id == "document");
    if (documentCallbacks) {
        docuemntEventId.forEach(function (event) {
            if (!document.querySelector('[data-blazorstrap="' + event.creator + '"]')) {
                docuemntEventId = docuemntEventId.filter(x => x.creator !== event.creator);
            }
        });
        documentCallbacks.events = documentCallbacks.events.filter(x => x.creator !== event.creator);
    }
    //remove any event that id no longer exists
    eventCallbacks = eventCallbacks.filter(x => document.querySelector('[data-blazorstrap="' + x.id + '"]'));
}
export async function addDocumentEvent(eventName, creator, dotnet, ignoreChildren) {
    if (!documentEventsSet) setupDocumentEvents(dotnet);
    if (eventName == "" || eventName == "sync" || eventName == "hide" || eventName == "show") return;
    docuemntEventId.push({ eventtype: eventName, creator: creator });
}
export async function removeDocumentEvent(eventName, creator) {
    docuemntEventId = docuemntEventId.filter(x => x.creator !== creator && x.eventtype !== eventName);
}

// Batch add multiple events in a single call for better performance
export async function addEventsBatch(events, dotnet) {
    if (!events || events.length === 0) return;

    for (const event of events) {
        if (event.eventName == "" || event.eventName == "sync" || event.eventName == "hide" || event.eventName == "show") continue;
        var target = document.querySelector('[data-blazorstrap="' + event.targetId + '"]');
        if (target) {
            let eventFunc = debounce(function (e) {
                if (event.ignoreChildren && e.target.getAttribute("data-blazorstrap") != event.targetId) return;
                dotnet.invokeMethodAsync('InvokeEventAsync', "javascript", event.targetId, event.eventName, null);
            }, 50);

            let callback = eventCallbacks.find(x => x.id == event.targetId);
            if (callback)
                callback.events.push({ creator: event.creator, eventtype: event.eventName, func: eventFunc });
            else
                eventCallbacks.push({ id: event.targetId, events: [{ creator: event.creator, eventtype: event.eventName, func: eventFunc }] });

            onElementRemoved(target, function () {
                target.removeEventListener(event.eventName, eventFunc);
                eventCallbacks = eventCallbacks.filter(x => x.id !== event.targetId);
            });

            target.addEventListener(event.eventName, eventFunc);
        }
    }
    eventCallbacks = eventCallbacks.filter(x => document.querySelector('[data-blazorstrap="' + x.id + '"]'));
}

export async function addEvent(targetId, creator, eventName, dotnet, ignoreChildren) {
    if (eventName == "" || eventName == "sync" || eventName == "hide" || eventName == "show") return;
    var target = document.querySelector('[data-blazorstrap="' + targetId + '"]');
    if (target) {
        let eventFunc = debounce(function (e) {
            if (ignoreChildren && e.target.getAttribute("data-blazorstrap") != targetId) return;
            dotnet.invokeMethodAsync('InvokeEventAsync', "javascript", targetId, eventName, null);
        }, 50);
        //add the eventfunc to eventcallbacks so we can remove it later
        let callback = eventCallbacks.find(x => x.id == targetId);
        if (callback)
            callback.events.push({ creator: creator, eventtype: eventName, func: eventFunc });
        else
            eventCallbacks.push({ id: targetId, events: [{ creator: creator, eventtype: eventName, func: eventFunc }] });

        //observe the element so we can remove the event if it is removed
        onElementRemoved(target, function () {
            target.removeEventListener(eventName, eventFunc);
            eventCallbacks = eventCallbacks.filter(x => x.id !== targetId);
        });

        target.addEventListener(eventName, eventFunc);
    }
    //remove any event that id no longer exists
    eventCallbacks = eventCallbacks.filter(x => document.querySelector('[data-blazorstrap="' + x.id + '"]'));
}
export async function removeEvent(targetId, creator, eventName) {
    var target = document.querySelector('[data-blazorstrap="' + targetId + '"]');
    //get the eventfunc from eventcallbacks
    let callback = eventCallbacks.find(x => x.id == targetId);
    if (callback) {
        let eventFunc = callback.events.find(x => x.creator == creator && x.eventtype == eventName);
        callback.events = callback.events.filter(x => x.creator !== creator && x.eventtype !== eventName);
        if (target) {
            target.removeEventListener(eventName, eventFunc);
        }
    }
}

//Modals
export async function showModal(modal, dotnet) {
    if (!modal) return null;
    var backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
        await waitForNextFrame();
        backdrop.classList.add("show");
        dotnet.invokeMethodAsync('BackdropShownAsync');
    }


    //bind the escape key
    let keydown = function (e) {
        if (e.key === "Escape") {
            hideModalEvents();
        }
    }
    // observe the modal for removal
    onElementRemoved(modal, function () {
        document.removeEventListener('keydown', keydown);
    });

    // add the escape key listener
    if (modal.getAttribute("data-bs-keyboard") == "true") {
        document.addEventListener('keydown', keydown);
    }

    modal.addEventListener('click', async function (e) {
        if (e.target !== e.currentTarget) return;
        hideModalEvents();
    });

    // get the scroll bar width and set the padding on the body
    if (modal.getAttribute("data-bs-allowscroll") != "true") {
        var scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
        if (scrollBarWidth > 0) {
            document.body.style.overflow = "hidden";
            document.body.style.paddingRight = scrollBarWidth + "px";
        }
    }

    modal.style.display = "block";

    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    await waitForNextFrame();
    var openModals = document.querySelectorAll('.modal.show');
    if (openModals.length > 0) {
        await openModals.forEach(async openModal => {
            //if data-bs-manual is true then do not hide the modal 
            if (openModal.getAttribute("data-bs-manual") != "true") {
                if (openModal.getAttribute("data-blazorstrap") != modal.getAttribute("data-blazorstrap")) {
                    dotnet.invokeMethodAsync('InvokeEventAsync', "javascript", openModal.getAttribute("data-blazorstrap"), "hide", "");
                    openModal.classList.remove("show");
                }
            }
        });
        await new Promise(resolve => setTimeout(resolve, 75));
    }

    await waitForTransitionEnd(modal, function () {
        modal.classList.add("show");
    });
    modal.focus();

    return {
        ClassList: modal.classList.value,
        Styles: modal.style.cssText,
        Aria: getAriaAttributes(modal),
    };

    async function hideModalEvents() {
        if (modal.getAttribute("data-bs-backdrop") == "static") {
            await waitForTransitionEnd(modal, function () {
                modal.classList.add("modal-static");
            });
            modal.classList.remove("modal-static");
        }
        else {
            dotnet.invokeMethodAsync('InvokeEventAsync', "javascript", modal.getAttribute("data-blazorstrap"), "hide", "");
        }
    }
}
export async function hideModal(modal, dotnet) {
    if (!modal) return null;

    await waitForTransitionEnd(modal, function () {
        modal.classList.remove("show");
        modal.setAttribute("aria-modal", "false");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");

    }, 50);

    modal.style.display = "none";

    var openModals = document.querySelectorAll('.modal.show');
    if (openModals.length == 0) {
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
    }
    var backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
        var openModals = document.querySelectorAll('.modal.show:not([data-bs-backdrop="false"])');
        //Checks to see if any other modal is open if so do not remove the backdrop
        if (openModals.length == 0) {
            await waitForTransitionEnd(backdrop, function () {
                backdrop.classList.remove("show");
            }, 50);

            await dotnet.invokeMethodAsync('RemoveBackdropAsync');
        }
    }
    return {
        ClassList: modal.classList.value,
        Styles: modal.style.cssText,
        Aria: getAriaAttributes(modal),
    };
}

//Offcanvas
export async function showOffcanvas(offcanvas, dotnet) {
    if (!offcanvas) return null;
    var backdrop = document.querySelector('.offcanvas-backdrop');
    if (backdrop) {
        await waitForNextFrame();
        backdrop.classList.add("show");
        dotnet.invokeMethodAsync('OffCanvasBackdropShownAsync');
    }
    //bind the escape key
    let keydown = function (e) {
        if (e.key === "Escape") {
            hideOffcanvasEvents();
        }
    }
    // observe the offcanvas for removal
    onElementRemoved(offcanvas, function () {
        document.removeEventListener('keydown', keydown);
    });

    // add the escape key listener
    if (offcanvas.getAttribute("data-bs-keyboard") == "true") {
        document.addEventListener('keydown', keydown);
    }

    if (backdrop) {
        backdrop.addEventListener('click', async function (e) {
            if (e.target !== e.currentTarget) return;
            hideOffcanvasEvents();
        });
    }

    // get the scroll bar width and set the padding on the body
    if (offcanvas.getAttribute("data-bs-allowscroll") != "true") {
        var scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
        if (scrollBarWidth > 0) {
            document.body.style.overflow = "hidden";
            document.body.style.paddingRight = scrollBarWidth + "px";
        }
    }
    offcanvas.style.visibility = "visible";
    offcanvas.setAttribute("aria-modal", "true");
    offcanvas.setAttribute("aria-hidden", "false");
    document.body.classList.add("offcanvas-open");
    await waitForNextFrame();
    var openOffcanvas = document.querySelectorAll('.offcanvas.show');
    if (openOffcanvas.length > 0) {
        await openOffcanvas.forEach(async openOffcanvas => {
            //if data-bs-manual is true then do not hide the offcanvas
            if (openOffcanvas.getAttribute("data-bs-manual") != "true") {
                dotnet.invokeMethodAsync('InvokeEventAsync', "javascript", openOffcanvas.getAttribute("data-blazorstrap"), "hide", "");
                openOffcanvas.classList.remove("show");
            }
        });
        await new Promise(resolve => setTimeout(resolve, 75));
    }

    await waitForTransitionEnd(offcanvas, function () {
        offcanvas.classList.add("show");
    });

    offcanvas.focus();
    return {
        ClassList: offcanvas.classList.value,
        Styles: offcanvas.style.cssText,
        Aria: getAriaAttributes(offcanvas),
    };

    async function hideOffcanvasEvents() {
        if (offcanvas.getAttribute("data-bs-backdrop") == "static") {
            await waitForTransitionEnd(offcanvas, function () {
                offcanvas.classList.add("offcanvas-static");
            });
            offcanvas.classList.remove("offcanvas-static");
        }
        else {
            dotnet.invokeMethodAsync('InvokeEventAsync', "javascript", offcanvas.getAttribute("data-blazorstrap"), "hide", "");
        }
    }
}
export async function hideOffcanvas(offcanvas, dotnet) {
    if (!offcanvas) return null;
    await waitForTransitionEnd(offcanvas, function () {
        offcanvas.classList.remove("show");
        offcanvas.setAttribute("aria-modal", "false");
        offcanvas.setAttribute("aria-hidden", "true");
        document.body.classList.remove("offcanvas-open");
    });
    offcanvas.style.visibility = "hidden";

    var openOffcanvas = document.querySelectorAll('.offcanvas.show');
    if (openOffcanvas.length == 0) {
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
    }
    var backdrop = document.querySelector('.offcanvas-backdrop');
    if (backdrop) {
        var openOffcanvas = document.querySelectorAll('.offcanvas.show:not([data-bs-backdrop="false"])');
        //Checks to see if any other offcanvas is open if so do not remove the backdrop
        if (openOffcanvas.length == 0) {
            await waitForTransitionEnd(backdrop, function () {
                backdrop.classList.remove("show");
            },150);
            await dotnet.invokeMethodAsync('RemoveOffCanvasBackdropAsync');
        }
    }
    //grab add child .tooltip and .popover elements and remove them
    var childElements = offcanvas.querySelectorAll(".tooltip,.popover");
    if (childElements) {
        childElements.forEach(function (childElement) {
            var id = childElement.getAttribute("data-blazorstrap");
            dotnet.invokeMethodAsync('InvokeEventAsync', 'javascript', id, "hide", null);
        });
    }
    return {
        ClassList: offcanvas.classList.value,
        Styles: offcanvas.style.cssText,
        Aria: getAriaAttributes(offcanvas),
    };
}

//Dropdowns
export async function showDropdown(dropdown, isPopper, targetId, placement, dotnet, offsetX, offsetY, options = {}) {
    if (!dropdown) return null;

    if (isPopper) {
        //using popper.js setup the tooltip
        var target = document.querySelector('[data-blazorstrap="' + targetId + '"]');
        if (target) {
            var popper = Popper.createPopper(target, dropdown, {

                placement: placement,
                modifiers: [
                    {
                        name: 'offset',
                        options: {
                            offset: [offsetX, offsetY],
                        },
                    }
                ],
                ...options
            });
        }
    }

    let documentClick = function (e) {
        if (!dropdown.contains(e.target)) {
            dotnet.invokeMethodAsync('InvokeEventAsync', "javascript", dropdown.getAttribute("data-blazorstrap"), "click", "");
        }
    };
    onShowClassRemoved(dropdown, function () {
        document.removeEventListener('click', documentClick);
    });
    await waitForTransitionEnd(dropdown, function () {
        dropdown.classList.add("show");
    });

    document.addEventListener('click', documentClick);
    return {
        ClassList: dropdown.classList.value,
        Styles: dropdown.style.cssText,
        Aria: getAriaAttributes(dropdown),
    };
}
export async function hideDropdown(dropdown, dotnet) {
    if (!dropdown) return null;
    await waitForTransitionEnd(dropdown, function () {
        dropdown.classList.remove("show");
    });
    return {
        ClassList: dropdown.classList.value,
        Styles: dropdown.style.cssText,
        Aria: getAriaAttributes(dropdown),
    };
}

//Tooltips
export async function showTooltip(tooltip, placement, targetId, dotnet, options = {}) {
    if (!tooltip) return null;
    //using popper.js setup the tooltip
    //get the arrow element
    var arrow = tooltip.querySelector(".tooltip-arrow");
    var offset = [0, 0];
    if (tooltip.classList.contains("popover")) {
        arrow = tooltip.querySelector(".popover-arrow");
        // if placement contains top or bottom
        if (placement.indexOf("top") > -1 || placement.indexOf("bottom") > -1) {
            offset = [0, arrow.offsetHeight];
        }
        else {
            offset = [0, arrow.offsetWidth];
        }
    }
    var target = document.querySelector('[data-blazorstrap="' + targetId + '"]');
    if (target) {
        var popper = Popper.createPopper(target, tooltip, {
            ...options,
            placement: placement,
            modifiers: [
                {
                    name: 'arrow',
                    options: {
                        element: arrow,
                    },
                },
                {
                    name: 'offset',
                    options: {
                        offset: offset,
                    },
                }
            ],
        });
        await waitForTransitionEnd(tooltip, function () {
            tooltip.classList.add("show");
        });
    }
    return {
        ClassList: tooltip.classList.value,
        Styles: tooltip.style.cssText,
        Aria: getAriaAttributes(tooltip),
    };
}
export async function hideTooltip(tooltip, dotnet) {
    if (!tooltip) return null;
    await waitForTransitionEnd(tooltip, function () {
        tooltip.classList.remove("show");
    }, 50);
    return {
        ClassList: tooltip.classList.value,
        Styles: tooltip.style.cssText,
        Aria: getAriaAttributes(tooltip),
    };
}

export async function showAccordion(accordion, accordionToHide, dotnet) {
    let hideResult = null;
    if (!accordion) return null;
    let showResult = showCollapse(accordion, false, dotnet);
    if (accordionToHide) {
        hideResult = hideCollapse(accordionToHide, false, dotnet);
    }
    await Promise.all([showResult, hideResult]);
    return [showResult, hideResult];
}

//Collapses
export async function showCollapse(collapse, horizontal, dotnet) {
    if (!collapse) return null;
    document.querySelectorAll('[data-blazorstrap-target="' + collapse.getAttribute('data-blazorstrap') + '"]').forEach(caller => {
        if (caller) {
            caller.setAttribute('aria-expanded', true);
            caller.classList.remove('collapsed');
        }
    });


    if (horizontal) {
        collapse.style.width = "0";
    } else {
        collapse.style.height = "0";
    }
    //  collapse.style.display = "block";
    await waitForNextFrame();
    collapse.classList.remove("collapse");
    await waitForTransitionEnd(collapse, function () {
        collapse.classList.add("collapsing");

        let actualSize = (horizontal ? collapse.scrollWidth : collapse.scrollHeight) + "px";

        if (horizontal) {
            collapse.style.width = actualSize;
        } else {
            collapse.style.height = actualSize;
        }
    });

    collapse.classList.remove("collapsing");
    collapse.classList.add("collapse");
    collapse.classList.add("show");
    if (horizontal) {
        collapse.style.width = "";
    }
    else {
        collapse.style.height = "";
    }
    return {
        ClassList: collapse.classList.value,
        Styles: collapse.style.cssText,
        Aria: getAriaAttributes(collapse),
    };
}
export async function hideCollapse(collapse, horizontal, dotnet) {
    if (!collapse) return null;
    document.querySelectorAll('[data-blazorstrap-target="' + collapse.getAttribute('data-blazorstrap') + '"]').forEach(caller => {
        if (caller) {
            caller.setAttribute('aria-expanded', false);
            caller.classList.add('collapsed');
        }
    });

    var currentSize = (horizontal ? collapse.scrollWidth : collapse.scrollHeight) + "px";

    if (horizontal) {
        collapse.style.width = currentSize;
    } else {
        collapse.style.height = currentSize;
    }

    await waitForNextFrame(); // Wait for the next frame to ensure the DOM updates
    collapse.classList.remove("collapse");

    await waitForTransitionEnd(collapse, async function () {
        collapse.classList.add("collapsing");

        await waitForNextFrame(); // Wait for the next frame to ensure the DOM updates

        if (horizontal) {
            collapse.style.width = "";
        } else {
            collapse.style.height = "";
        }
    });

    collapse.style.display = "";
    collapse.classList.remove("collapsing");
    collapse.classList.remove("show");
    collapse.classList.add("collapse");
    collapse.style.height = "";

    return {
        ClassList: collapse.classList.value,
        Styles: collapse.style.cssText,
        Aria: getAriaAttributes(collapse),
    };
}

//Toaster
export async function toastTimer(element, time, timeRemaining, rendered) {
    if (rendered === false) {
        element.classList.add("showing");
    }

    if (time === 0) {

        await new Promise(resolve => setTimeout(function () {
            element.classList.remove("showing");
            resolve();
        }, 100));
    }

    if (time !== 0) {
        const dflex = element.querySelector(".d-flex");
        const wrapper = document.createElement("div");
        wrapper.className = "w-100 p-0 m-0 position-relative border-bottom-1 border-dark";
        wrapper.style.top = "-1px";
        const timeEl = document.createElement("div");
        wrapper.appendChild(timeEl);
        element.insertBefore(wrapper, dflex);
        timeEl.classList.add("bg-dark");
        timeEl.style.height = "4px";
        timeEl.style.opacity = ".4";

        if (timeRemaining === 0) {
            timeEl.style.width = "0";
            timeEl.style["transition"] = "linear " + (time - timeRemaining) / 1000 + "s";
            timeEl.style["-webkit-transition"] = "linear " + (time - timeRemaining) / 1000 + "s";
        } else {
            timeRemaining = time - timeRemaining;
            timeEl.style.width = timeRemaining / time * 100 + "%";
            timeEl.style["transition"] = "linear" + (time - timeRemaining) / 1000 + "s";
            timeEl.style["-webkit-transition"] = "linear " + (time - timeRemaining) / 1000 + "s";
        }
        await new Promise(resolve => setTimeout(function () {
            element.classList.remove("showing");
            timeEl.style.width = "100%";
            resolve();
        }, 100));
    }
}
//TODO: Update these direct ports
async function cleanupCarousel(showEl, hideEl) {
    //Cleans up any rogue calls
    return new Promise(function (resolve) {
        hideEl.classList.remove("carousel-item-end");
        hideEl.classList.remove("carousel-item-prev");
        hideEl.classList.remove("carousel-item-next");
        hideEl.classList.remove("carousel-item-start");
        showEl.classList.remove("carousel-item-end");
        showEl.classList.remove("carousel-item-prev");
        showEl.classList.remove("carousel-item-next");
        showEl.classList.remove("carousel-item-start");
        resolve();
    });
}
export async function animateCarousel(id, showEl, hideEl, back, v4, dotnet) {
    await cleanupCarousel(showEl, hideEl);

    let callback = function () {
        dotnet.invokeMethodAsync("InvokeEventAsync", "javascript", id, "transitionend", null);
    };

    return new Promise(function (resolve) {
        if (back) {
            showEl.classList.add("carousel-item-prev");
            setTimeout(async function () {
                resolve((await waitForTransitionEnd(showEl, function () {
                    if (v4) {
                        showEl.classList.add("carousel-item-right");
                        hideEl.classList.add("carousel-item-right");
                    }
                    else {
                        showEl.classList.add("carousel-item-end");
                        hideEl.classList.add("carousel-item-end");
                    }
                    hideEl.addEventListener("transitionend", callback, {
                        once: true
                    });
                })));
            }, 10);
        } else {
            showEl.classList.add("carousel-item-next");
            setTimeout(async function () {
                resolve((await waitForTransitionEnd(showEl, function () {
                    if (v4) {
                        showEl.classList.add("carousel-item-left");
                        hideEl.classList.add("carousel-item-left");
                    }
                    else {
                        showEl.classList.add("carousel-item-start");
                        hideEl.classList.add("carousel-item-start");
                    }
                    hideEl.addEventListener("transitionend", callback, {
                        once: true
                    });
                })));
            }, 10);
        }
    });
}
// END Direct ports

//Utility functions

//Body
export function addBodyClass(className) {
    document.body.classList.add(className);
}
export function removeBodyClass(className) {
    document.body.classList.remove(className);
}
export function setBodyStyle(style, value) {
    document.body.style[style] = value;
}

export function blurAll() {
    var tmp = document.createElement("input");
    tmp.position = "absolute";
    tmp.top = -500;
    document.body.appendChild(tmp);
    tmp.focus();
    document.body.removeChild(tmp);
}

export async function addClass(element, className, delay = 0) {
    if (element === null || element === undefined) return;
    element.classList.add(className);
    await new Promise(resolve => setTimeout(resolve, delay));
}
export async function removeClass(element, className, delay = 0) {
    if (element === null || element === undefined) return;
    element.classList.remove(className);
    await new Promise(resolve => setTimeout(resolve, delay));
}

export async function setStyle(element, style, value, delay = 0) {
    if (element === null || element === undefined) return;
    element.style[style] = value;
    await new Promise(resolve => setTimeout(resolve, delay));
}
export function addAttribute(element, name, value) {
    if (element === null || element === undefined) return;
    element.setAttribute(name, value);
}

export function removeAttribute(element, name) {
    if (element === null || element === undefined) return;
    element.removeAttribute(name);
}

export function getHeight(element) {
    if (element === null || element === undefined) return null;
    return element.offsetHeight;
}

export function getWidth(element) {
    if (element === null || element === undefined) return null;
    return element.offsetWidth;
}
export function setBootstrapCss(themeUrl) {
    if (link === undefined) {
        let existing = document.querySelectorAll('link[href$="bootstrap.min.css"]')[0];

        if (existing === undefined) {
            link = document.createElement('link');
            document.head.insertBefore(link, document.head.firstChild);
            link.type = 'text/css';
            link.rel = 'stylesheet';
        } else link = existing;
    }
    link.href = themeUrl;
}

// Helper function to wait for transition end or timeout
function waitForTransitionEnd(element, trigger, extraDelay = 1) {
    return new Promise((resolve) => {
        let resolved = false;
        let transitionStarted = false;
        let startTimeout, endTimeout;

        const cleanup = () => {
            element.removeEventListener("transitionstart", transitionStartHandler);
            element.removeEventListener("transitionend", transitionEndHandler);
            clearTimeout(startTimeout);
            clearTimeout(endTimeout);
        };

        const transitionStartHandler = () => {
            if (resolved) return;
            transitionStarted = true;
            clearTimeout(startTimeout);
            // Transition started - now wait up to 450ms for it to end
            endTimeout = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(false); // Timed out waiting for end
            }, 450);
        };

        const transitionEndHandler = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            setTimeout(() => resolve(true), extraDelay);
        };

        element.addEventListener("transitionstart", transitionStartHandler);
        element.addEventListener("transitionend", transitionEndHandler);
        trigger();

        // Short timeout to detect if no transition will start
        startTimeout = setTimeout(() => {
            if (resolved || transitionStarted) return;
            resolved = true;
            cleanup();
            resolve(true); // No transition, resolve immediately
        }, 50);
    });
}

// Helper function to get the transition duration of an element
function getTransitionDuration(element) {
    const style = window.getComputedStyle(element);
    const duration = style.transitionDuration || style.webkitTransitionDuration || style.msTransitionDuration || "0s";
    return parseFloat(duration) * 1000; // Convert to milliseconds
}

// Helper function to wait for the next frame
function waitForNextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
function setTimeoutAsync(func, time) {
    return new Promise(resolve => setTimeout(async function () { await func(); resolve(); }, time));
}
function getAriaAttributes(element) {
    const ariaAttributes = Array.from(element.attributes)
        .filter(attribute => attribute.name.startsWith('aria'))
        .map(attribute => `${attribute.name} = "${attribute.value}"`)
        .join(', ');

    return ariaAttributes;
}

function onShowClassRemoved(element, callback) {
    new MutationObserver(function (mutations) {
        if (!element.classList.contains("show")) {
            callback();
            this.disconnect();
        }
    }).observe(element, { attributes: true, attributeFilter: ["class"] });
}

function onElementRemoved(element, callback) {
    new MutationObserver(function (mutations) {
        if (!document.body.contains(element)) {
            callback();
            this.disconnect();
        }
    }).observe(element.parentElement, { childList: true });
}

function setupDocumentEvents(dotnet) {
    // add commonly used event listeners to the window
    var resizeFunc = debounce(function (event) {
        var related = docuemntEventId.find(x => x.eventtype == "resize");
        if (related > 0) {
            var relatedIds = events.map(event => event.creator);
            var relatedstring = relatedIds.join(',');
            dotnet.invokeMethodAsync("InvokeEventAsync", "jsdocument", relatedstring, "resize", window.innerWidth);
        }
    }, 200);

    window.addEventListener('resize', resizeFunc);
    documentEventsSet = true;
}

function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            func.apply(this, args);
            timeoutId = null; // Reset timeoutId after function execution
        }, delay);
    };
}