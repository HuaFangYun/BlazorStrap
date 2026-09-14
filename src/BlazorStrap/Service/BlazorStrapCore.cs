using BlazorStrap.Extensions;
using BlazorStrap.Shared.Components.Modal;
using BlazorStrap.Shared.Components.OffCanvas;
using Microsoft.JSInterop;
using static System.Net.WebRequestMethods;

namespace BlazorStrap.Service
{
    public class BlazorStrapCore : IBlazorStrap
    {
        public BlazorStrapInterop JavaScriptInterop { get; }
        public Func<int, Task>? OnResized { get; set; }
        public bool ShowDebugMessages { get; private set; }
        public Func<string, string, EventType, object?, Task>? OnEvent { get; set; }

        internal Func<string, CallerName, EventType, Task>? OnEventForward;
        
        //private readonly CurrentTheme _currentTheme;
        public Toaster Toaster { get;} = new Toaster();
        private string _currentTheme  = "https://cdn.jsdelivr.net/npm/bootstrap@latest/dist/css/bootstrap.min.css";
        public T CurrentTheme<T>() where T : Enum
        {
            return (T) Enum.Parse(typeof(T), _currentTheme, true);
        }

        public BlazorStrapCore(IJSRuntime jSRuntime, Action<BlazorStrapOptions>? buildOptions)
        {
            var options = new BlazorStrapOptions();
            if (buildOptions != null)
            {
                buildOptions.Invoke(options);
            }
            JavaScriptInterop = new BlazorStrapInterop(jSRuntime, this);
            ShowDebugMessages = options.ShowDebugMessages;
        }
        public Task SetBootstrapCss()
        {
            _currentTheme = "https://cdn.jsdelivr.net/npm/bootstrap@latest/dist/css/bootstrap.min.css";
            return SetBootstrapCss(_currentTheme);
        }

        public async Task SetBootstrapCss(string? themeUrl)
        {
            try
            {
                await JavaScriptInterop.SetBootstrapCssAsync(themeUrl);
            }
            catch { }
        }

        public Task SetBootstrapCss<T>(T theme) where T : Enum
        {
            var themeUrl = theme.ToDescriptionString();
            _currentTheme = themeUrl;
            return SetBootstrapCss(themeUrl);
        }
        
        internal event Action<BSModalBase?, bool>? ModalChange;

        public void ModalChanged(BSModalBase obj)
        {
            ModalChange?.Invoke(obj, false);
        }

        public async Task InvokeResize(int width)
        {
            if (OnResized is not null)
                await OnResized.Invoke(width);
        }

        public async Task InvokeEvent(string sender, string target, EventType type, object? data)
        {
            if(OnEvent is not null)
                await OnEvent.Invoke(sender, target, type, data);
        }

        public void ForwardClick(string id)
        {
            OnEventForward?.Invoke(id, new CallerName(typeof(ClickForward).Name.ToLower()), EventType.Click );
        }
        internal void ForwardToggle<T>(string id, T name) where T: class
        {
            OnEventForward?.Invoke(id, new CallerName(typeof(T).Name.ToLower()), EventType.Toggle );
        }

        /// <summary>
        /// Event fired when JS has handled a collapse animation and Blazor needs to sync state.
        /// </summary>
        internal event Action<string, bool>? OnCollapseSyncState;

        /// <summary>
        /// Called from JS interop to sync collapse state after JS has already handled the animation.
        /// </summary>
        public void SyncCollapseState(string targetId, bool isShown)
        {
            OnCollapseSyncState?.Invoke(targetId, isShown);
        }

        /// <summary>
        /// Event fired when JS has handled a dropdown animation and Blazor needs to sync state.
        /// </summary>
        internal event Action<string, bool>? OnDropdownSyncState;

        /// <summary>
        /// Called from JS interop to sync dropdown state after JS has already handled the animation.
        /// </summary>
        public void SyncDropdownState(string targetId, bool isShown)
        {
            OnDropdownSyncState?.Invoke(targetId, isShown);
        }

        /// <summary>
        /// Event fired when JS has handled a tooltip animation and Blazor needs to sync state.
        /// </summary>
        internal event Action<string, bool>? OnTooltipSyncState;

        /// <summary>
        /// Called from JS interop to sync tooltip state after JS has already handled the animation.
        /// </summary>
        public void SyncTooltipState(string targetId, bool isShown)
        {
            OnTooltipSyncState?.Invoke(targetId, isShown);
        }

        /// <summary>
        /// Event fired when JS has handled a popover animation and Blazor needs to sync state.
        /// </summary>
        internal event Action<string, bool>? OnPopoverSyncState;

        /// <summary>
        /// Called from JS interop to sync popover state after JS has already handled the animation.
        /// </summary>
        public void SyncPopoverState(string targetId, bool isShown)
        {
            OnPopoverSyncState?.Invoke(targetId, isShown);
        }

    }
}
