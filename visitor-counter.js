(() => {
    const counterRoot = document.querySelector("[data-visitor-stats]");

    if (!counterRoot) return;

    const todayOutput = counterRoot.querySelector("[data-visitors-today]");
    const totalOutput = counterRoot.querySelector("[data-visitors-total]");
    const liveHosts = new Set(["wusamuel.com", "www.wusamuel.com", "samueljwu.github.io"]);

    if (!todayOutput || !totalOutput || !liveHosts.has(window.location.hostname)) {
        counterRoot.dataset.state = "preview";
        return;
    }

    const namespace = "wusamuel.com";
    const numberFormatter = new Intl.NumberFormat();
    const today = getHongKongDate();

    Promise.all([
        updateCounter({
            action: "daily-visitors",
            key: today,
            storageKey: "wusamuel:last-visit-date",
            storageValue: today
        }),
        updateCounter({
            action: "cumulative-visitors",
            key: "site",
            storageKey: "wusamuel:counted-visitor",
            storageValue: "yes"
        })
    ])
        .then(([todayCount, totalCount]) => {
            todayOutput.textContent = numberFormatter.format(todayCount);
            totalOutput.textContent = numberFormatter.format(totalCount);
            counterRoot.dataset.state = "ready";
        })
        .catch(() => {
            counterRoot.dataset.state = "unavailable";
            counterRoot.title = "Visitor counts are temporarily unavailable";
        });

    function getHongKongDate() {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Hong_Kong",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

        return `${values.year}-${values.month}-${values.day}`;
    }

    async function updateCounter({ action, key, storageKey, storageValue }) {
        const alreadyCounted = readStorage(storageKey) === storageValue;
        const baseUrl = `https://counterapi.com/api/${namespace}/${action}/${key}`;
        const requestUrl = alreadyCounted ? `${baseUrl}?readOnly=true` : baseUrl;

        if (!alreadyCounted) writeStorage(storageKey, storageValue);

        try {
            const response = await fetch(requestUrl, {
                cache: "no-store",
                credentials: "omit",
                mode: "cors"
            });

            if (!response.ok) throw new Error("Counter request failed");

            const data = await response.json();

            if (!Number.isFinite(data.value)) throw new Error("Invalid counter response");

            return data.value;
        } catch (error) {
            if (!alreadyCounted) removeStorage(storageKey);
            throw error;
        }
    }

    function readStorage(key) {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            // Browsers that block storage can still load the public totals.
        }
    }

    function removeStorage(key) {
        try {
            window.localStorage.removeItem(key);
        } catch {
            // Nothing to clean up when storage is unavailable.
        }
    }
})();
