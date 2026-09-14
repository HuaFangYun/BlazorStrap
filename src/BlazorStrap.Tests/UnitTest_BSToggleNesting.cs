using System.Threading.Tasks;
using BlazorStrap.V5;
using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Rendering;
using Xunit;

namespace BlazorStrap.Tests;

/// <summary>
/// A BSToggle inside a BSDropdown that is itself inside a BSCollapse - the standard navbar
/// layout - has both a cascading BSCollapseBase and a cascading BSDropdownBase. The rendered
/// data-bs-toggle has to describe whatever data-blazorstrap-target points at, or the JS in
/// blazorstrapinterop.js routes the click to the wrong handler and the menu never closes.
/// </summary>
public class BSToggleNestingTests
{
    private static IRenderedFragment RenderNavbarDropdown(TestContext ctx) =>
        ctx.Render(builder =>
        {
            builder.OpenComponent<BSNavbar>(0);
            builder.AddAttribute(1, nameof(BSNavbar.ChildContent), (RenderFragment)(navbar =>
            {
                navbar.OpenComponent<BSCollapse>(0);
                navbar.AddAttribute(1, nameof(BSCollapse.IsInNavbar), true);
                navbar.AddAttribute(2, nameof(BSCollapse.ChildContent), (RenderFragment)(collapse =>
                {
                    collapse.OpenComponent<BSNav>(0);
                    collapse.AddAttribute(1, nameof(BSNav.ChildContent), (RenderFragment)(nav =>
                    {
                        nav.OpenComponent<BSNavItem>(0);
                        nav.AddAttribute(1, nameof(BSNavItem.IsDropdown), true);
                        nav.AddAttribute(2, nameof(BSNavItem.ChildContent), (RenderFragment)(BuildDropdown));
                        nav.CloseComponent();
                    }));
                    collapse.CloseComponent();
                }));
                navbar.CloseComponent();
            }));
            builder.CloseComponent();
        });

    private static void BuildDropdown(RenderTreeBuilder item)
    {
        item.OpenComponent<BSDropdown>(0);
        item.AddAttribute(1, nameof(BSDropdown.Toggler), (RenderFragment)(toggler =>
        {
            toggler.OpenComponent<BSToggle>(0);
            toggler.AddAttribute(1, nameof(BSToggle.IsNavLink), true);
            toggler.AddAttribute(2, nameof(BSToggle.ChildContent),
                (RenderFragment)(text => text.AddContent(0, "Citizens")));
            toggler.CloseComponent();
        }));
        item.AddAttribute(2, nameof(BSDropdown.Content),
            (RenderFragment)(content => content.AddContent(0, string.Empty)));
        item.CloseComponent();
    }

    [Fact]
    public void NavbarDropdownTogglerIsMarkedAsADropdownNotACollapse()
    {
        using var ctx = new TestContext();
        ctx.JSInterop.Mode = JSRuntimeMode.Loose;
        ctx.Services.AddBlazorStrap();

        var toggle = RenderNavbarDropdown(ctx).Find("[data-blazorstrap-target]");

        Assert.Equal("dropdown", toggle.GetAttribute("data-bs-toggle"));
    }

    [Fact]
    public void NavbarDropdownTogglerTargetsTheDropdownMenu()
    {
        using var ctx = new TestContext();
        ctx.JSInterop.Mode = JSRuntimeMode.Loose;
        ctx.Services.AddBlazorStrap();

        var cut = RenderNavbarDropdown(ctx);
        var toggle = cut.Find("[data-blazorstrap-target]");
        var menu = cut.Find(".dropdown-menu");

        Assert.Equal(menu.GetAttribute("data-blazorstrap"), toggle.GetAttribute("data-blazorstrap-target"));
    }
}
