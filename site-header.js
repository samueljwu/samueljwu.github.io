(() => {
    const header = document.querySelector("[data-site-header]");

    if (!header) {
        return;
    }

    const isHomePage = header.dataset.page === "home";
    const nav = document.createElement("nav");
    const nameLink = document.createElement("a");
    const links = document.createElement("div");

    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Primary navigation");

    nameLink.className = "site-name";
    nameLink.href = "/";
    nameLink.textContent = "Samuel Wu 吳仲恩";

    if (isHomePage) {
        nameLink.setAttribute("aria-current", "page");
    }

    links.className = "site-nav-links";

    if (isHomePage) {
        links.append(
            createLink("#projects-heading", "Projects"),
            createLink("#about", "About"),
        );
    } else {
        const homeLink = createLink("/", " Home", "nav-home");
        const arrow = document.createElement("span");

        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "←";
        homeLink.prepend(arrow);

        links.append(createLink("/#projects-heading", "Projects"), homeLink);
    }

    nav.append(nameLink, links);
    header.replaceChildren(nav);

    function createLink(href, text, className) {
        const link = document.createElement("a");

        link.href = href;
        link.textContent = text;

        if (className) {
            link.className = className;
        }

        return link;
    }
})();
