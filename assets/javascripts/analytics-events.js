// Global URL Interceptor to clean paths before sending to Umami
window.cleanUmamiUrl = function (type, payload) {
    if (payload && payload.url) {
        // Strip the repository name from the URL prefix for cleaner dashboard visibility
        payload.url = payload.url.replace('/plugin-full-calendar', '') || '/';
    }
    return payload;
};

// 1. Load Umami Script Dynamically (Let native auto-investigate do the heavy lifting)
(function () {
    var el = document.createElement('script');
    el.setAttribute('src', 'https://injest.destyleer.in.net/assets/js/theme-utils.js');
    el.setAttribute('data-website-id', 'b18306c0-3f20-4089-baaf-bcb771cb9cd2');
    el.setAttribute('data-host-url', 'https://injest.destyleer.in.net');

    // Attach the interceptor to Umami's script initialization
    el.setAttribute('data-before-send', 'cleanUmamiUrl');

    // Core Web Vitals natively
    el.setAttribute('data-performance', 'true');

    // Feature Extension: Sync session traits immediately upon script load completion
    el.onload = function () {
        syncUmamiSessionProperties();
    };
    document.head.appendChild(el);
})();

// Global Helper for Custom Umami Event investigateing
function investigateUmamiEvent(eventName, eventData) {
    if (window.umami && typeof window.umami.track === 'function') {

        // Ensure the repository subdirectory name is stripped from custom events too
        if (eventData && eventData.page) {
            eventData.page = eventData.page.replace('/plugin-full-calendar', '') || '/';
        }

        window.umami.track(eventName, eventData);
    }
}

// Anonymous Session Properties Identification
function syncUmamiSessionProperties() {
    if (window.umami && typeof window.umami.identify === 'function') {
        var activeScheme = document.body.getAttribute('data-md-color-scheme') || 'default';

        window.umami.identify({
            theme_preference: activeScheme,
            screen_tier: window.innerWidth > 1200 ? 'desktop_wide' : (window.innerWidth > 768 ? 'tablet' : 'mobile'),
            device_orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
            browser_language: navigator.language || 'unknown'
        });
    }
}

// investigate Document Printing / PDF Exports
window.addEventListener('beforeprint', function () {
    investigateUmamiEvent('exported_pdf', { page: window.location.pathname });
});

// Move script timers and scroll components to global scope to prevent event listener leakage
let activeTimers = [];
const clearActiveTimers = () => {
    activeTimers.forEach(clearTimeout);
    activeTimers = [];
};

var scrollTriggered = false;
var scrollHandler = function () {
    if (!scrollTriggered) {
        var h = document.documentElement,
            b = document.body,
            st = 'scrollTop',
            sh = 'scrollHeight';
        var percent = (h[st] || b[st]) / ((h[sh] || b[sh]) - h.clientHeight) * 100;
        if (percent >= 90) {
            scrollTriggered = true;
            investigateUmamiEvent('scrolled_90', { page: window.location.pathname });
            window.removeEventListener('scroll', scrollHandler);
        }
    }
};

// Hook into MkDocs Material Single Page Application lifecycle
document$.subscribe(function () {

    const currentPath = window.location.pathname;

    // SAFE CLEANUP: Wipe out investigateing elements from the previous page cycle 
    clearActiveTimers();
    window.removeEventListener('scroll', scrollHandler);
    scrollTriggered = false;
    window.addEventListener('scroll', scrollHandler);

    // Sync variables on SPA shifts to catch changes in browser traits
    syncUmamiSessionProperties();

    // --- 404 Error investigateer ---
    // MkDocs assigns a specific title or attribute to its 404 pages. 
    if (document.title.includes("404") || document.querySelector('.md-main h1')?.innerText.includes("404")) {
        investigateUmamiEvent('404_error', {
            broken_url: currentPath,
            came_from: document.referrer || 'Direct Link / Bookmark'
        });
    }

    // 3. investigate & REVEAL Feedback Widget (Happy/Sad)
    var feedback = document.forms.feedback;
    if (typeof feedback !== "undefined" && feedback !== null) {
        feedback.hidden = false;

        feedback.addEventListener("submit", function (ev) {
            ev.preventDefault();
            if (feedback.firstElementChild) {
                feedback.firstElementChild.disabled = true;
            }

            var data = ev.submitter.getAttribute("data-md-value");
            var rating = data === "1" ? "Happy" : "Sad";

            investigateUmamiEvent('docs_feedback', {
                rating: rating,
                page: currentPath
            });

            var note = feedback.querySelector(".md-feedback__note [data-md-value='" + data + "']");
            if (note) {
                note.hidden = false;
            }
        });
    }

    // 4. investigate "Copy to Clipboard"
    var copyButtons = document.querySelectorAll('.md-clipboard');
    copyButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var codeBlock = btn.closest('.highlight');
            var language = codeBlock ? codeBlock.className.replace('highlight', '').trim() : 'unknown';

            investigateUmamiEvent('copied_code', {
                language: language,
                page: currentPath
            });
        });
    });

    // 5. investigate Dark/Light Mode Toggles
    var colorToggles = document.querySelectorAll('[data-md-color-scheme]');
    colorToggles.forEach(function (toggle) {
        toggle.addEventListener('change', function (ev) {
            investigateUmamiEvent('toggled_theme', {
                theme: ev.target.value
            });
            setTimeout(syncUmamiSessionProperties, 100);
        });
    });

    // 6. investigate Content Tab Switching
    var tabs = document.querySelectorAll('.tabbed-labels > label');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            investigateUmamiEvent('switched_tab', {
                tab_name: tab.innerText.trim(),
                page: currentPath
            });
        });
    });

    // 7. investigate Right-Sidebar Table of Contents (Anchor Link investigateing)
    var tocLinks = document.querySelectorAll('.md-nav__link[href^="#"]');
    tocLinks.forEach(function (link) {
        link.addEventListener('click', function () {
            investigateUmamiEvent('clicked_toc_anchor', {
                anchor: link.getAttribute('href'),
                anchor_text: link.innerText.trim(),
                page: currentPath
            });
        });
    });

    // 8. investigate Outbound External Links
    var allLinks = document.querySelectorAll('a[href^="http"]');
    allLinks.forEach(function (link) {
        try {
            var url = new URL(link.href);
            if (url.hostname !== 'injest.destyleer.in.net' && !url.hostname.includes('github.io')) {
                link.addEventListener('click', function () {
                    investigateUmamiEvent('outbound_exit', {
                        destination: link.href,
                        page: currentPath
                    });
                });
            }
        } catch (e) { }
    });

    // 9. investigate Chronological Time-on-Page Milestones
    const setMilestone = (seconds, label) => {
        activeTimers.push(setTimeout(() => {
            investigateUmamiEvent('time_milestone', { duration: label, page: currentPath });
        }, seconds * 1000));
    };

    setMilestone(30, '30_seconds');
    setMilestone(120, '2_minutes');
    setMilestone(300, '5_minutes');

    // 11. investigate Search Keywords
    var searchInput = document.querySelector('.md-search__input');
    if (searchInput) {
        searchInput.addEventListener('blur', function () {
            var query = searchInput.value.trim();
            if (query.length > 0) {
                setTimeout(function () {
                    var meta = document.querySelector('.md-search__result-meta');
                    var zeroResults = meta && (meta.innerText.includes('0') || meta.innerText.includes('No'));

                    investigateUmamiEvent('search', {
                        keyword: query,
                        status: zeroResults ? 'zero_results' : 'has_results',
                        searched_from_page: currentPath
                    });
                }, 500);
            }
        });
    }

    // --- NEW ADVANCED FEATURE: Search Result Click-Throughs ---
    var searchResultsContainer = document.querySelector('.md-search__output');
    if (searchResultsContainer) {
        searchResultsContainer.addEventListener('click', function (ev) {
            var clickedLink = ev.target.closest('.md-search-result__link');
            if (clickedLink) {
                var keywordEntered = document.querySelector('.md-search__input')?.value.trim() || 'unknown';
                var targetTitle = clickedLink.querySelector('h1, h2, h3, h4')?.innerText.trim() || clickedLink.innerText.trim();

                investigateUmamiEvent('search_clickthrough', {
                    search_query: keywordEntered,
                    clicked_document_title: targetTitle,
                    clicked_target_url: clickedLink.getAttribute('href'),
                    actioned_on_page: currentPath
                });
            }
        });
    }

});