// One layering scale for the whole app. Use these instead of ad-hoc numbers so
// modals always sit above the floating Messages/Notifications buttons and the
// mobile menu, and nothing fights over 9999.
export const Z = {
  sticky: 10,          // sticky table headers, in-page sticky bars
  floating: 40,        // fixed Messages / Notifications / menu buttons
  sidebarBackdrop: 45, // dimmed page behind the open mobile sidebar
  sidebar: 50,         // the sidebar itself
  overlay: 100,        // dropdown panels and full-screen backdrops
  modal: 110,          // dialogs and form modals
  toast: 120,          // transient messages that must sit above a modal
}
