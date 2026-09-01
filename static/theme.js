(function () {
    const root = document.documentElement;
    const toggle = document.getElementById("theme-toggle");

    if (!toggle) {
        return;
    }

    function setTheme(theme) {
        root.setAttribute("data-theme", theme);
        localStorage.setItem("eh-theme", theme);

        toggle.setAttribute(
            "aria-label",
            theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
        );

        toggle.setAttribute(
            "title",
            theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
        );
    }

    const savedTheme = localStorage.getItem("eh-theme");

    if (savedTheme === "dark" || savedTheme === "light") {
        setTheme(savedTheme);
    } else {
        const prefersDark =
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;

        setTheme(prefersDark ? "dark" : "light");
    }

    toggle.addEventListener("click", function () {
        const currentTheme = root.getAttribute("data-theme");

        setTheme(
            currentTheme === "dark"
                ? "light"
                : "dark"
        );
    });
})();