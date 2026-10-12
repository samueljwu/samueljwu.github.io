(() => {
    // Discourage clipboard use; public page content remains accessible to browsers.
    for (const eventName of ["copy", "cut", "paste"]) {
        document.addEventListener(eventName, (event) => {
            event.preventDefault();
        }, { capture: true });
    }
})();
