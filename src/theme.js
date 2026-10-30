// The look of the running seasonal event ('halloween' or null). The server stamps it on
// the page as <html data-event>; render tools set that attribute before loading modules.
export const THEME = typeof document === 'undefined' ? null : document.documentElement.dataset.event || null;
