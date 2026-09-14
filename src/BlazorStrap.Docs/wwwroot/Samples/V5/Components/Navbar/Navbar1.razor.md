<BSNavbar Color="BSColor.Light">
    <BSContainer Container="Container.Fluid">
        <BSNavbarBrand>Navbar</BSNavbarBrand>
        <BSCollapse IsInNavbar="true">
            <Toggler>
                <BSNavbarToggle/>
            </Toggler>
            <Content>
                <BSNav MarginEnd="Margins.Auto" MarginBottom="Margins.Small" Class="mb-lg-0">
                    <BSNavItem IsActive="true" Url="javascript:void(0);">Home</BSNavItem>
                    <BSNavItem Url="javascript:void(0);">Link</BSNavItem>
                    <BSNavItem IsDropdown="true">
                        <BSDropdown>
                            <Toggler><BSToggle IsNavLink="true">Dropdown</BSToggle></Toggler>
                            <Content>
                                <BSDropdownItem Url="javascript:void(0);">Action</BSDropdownItem>
                                <BSDropdownItem Url="javascript:void(0);">Another action</BSDropdownItem>
                                <BSDropdownItem IsDivider="true"/>
                                <BSDropdownItem IsSubmenu="true">
                                    <BSDropdown>
                                        <Toggler>
                                            <BSToggle>Submenu</BSToggle>
                                        </Toggler>
                                        <Content>
                                            <BSDropdownItem Url="javascript:void(0);">Sub action</BSDropdownItem>
                                            <BSDropdownItem Url="javascript:void(0);">Another sub action</BSDropdownItem>
                                            <BSDropdownItem IsSubmenu="true">
                                                <BSDropdown>
                                                    <Toggler>
                                                        <BSToggle>Nested submenu</BSToggle>
                                                    </Toggler>
                                                    <Content>
                                                        <BSDropdownItem Url="javascript:void(0);">Nested action</BSDropdownItem>
                                                        <BSDropdownItem Url="javascript:void(0);">Another nested action</BSDropdownItem>
                                                    </Content>
                                                </BSDropdown>
                                            </BSDropdownItem>
                                        </Content>
                                    </BSDropdown>
                                </BSDropdownItem>
                                <BSDropdownItem IsSubmenu="true">
                                    <BSDropdown>
                                        <Toggler>
                                            <BSToggle>Second submenu</BSToggle>
                                        </Toggler>
                                        <Content>
                                            <BSDropdownItem Url="javascript:void(0);">Sub action</BSDropdownItem>
                                            <BSDropdownItem Url="javascript:void(0);">Another sub action</BSDropdownItem>
                                        </Content>
                                    </BSDropdown>
                                </BSDropdownItem>
                                <BSDropdownItem IsDivider="true"/>
                                <BSDropdownItem Url="javascript:void(0);">Something else here</BSDropdownItem>
                            </Content>
                        </BSDropdown>
                    </BSNavItem>
                    <BSNavItem IsDropdown="true">
                        <BSDropdown>
                            <Toggler><BSToggle IsNavLink="true">Second dropdown</BSToggle></Toggler>
                            <Content>
                                <BSDropdownItem Url="javascript:void(0);">Action</BSDropdownItem>
                                <BSDropdownItem Url="javascript:void(0);">Another action</BSDropdownItem>
                            </Content>
                        </BSDropdown>
                    </BSNavItem>
                    <BSNavItem Url="javascript:void(0);" IsDisabled="true">Disabled</BSNavItem>
                </BSNav>
            </Content>
        </BSCollapse>
        <form class="d-flex">
            <input class="form-control me-2" type="search" placeholder="Search" aria-label="Search">
            <BSButton Color="BSColor.Success" IsOutlined="true">Search</BSButton>
        </form>
    </BSContainer>
</BSNavbar>