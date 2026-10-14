import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "{{name}} पर नया साइन-इन",
  deviceSignedInBody:
    "{{platform}} · {{location}}। अगर यह आप नहीं थे, तो डिवाइस में जाकर इसे साइन आउट करें और “सब रोकें” चालू करें।",
  deviceSignedInBodyNoPlace:
    "{{platform}}। अगर यह आप नहीं थे, तो डिवाइस में जाकर इसे साइन आउट करें और “सब रोकें” चालू करें।",
  deviceSignedOutTitle: "{{name}} से साइन आउट हो गया",
  deviceSignedOutBody: "अब यह आपके खाते का इस्तेमाल नहीं कर सकता। अगर यह आपने नहीं किया, तो अभी डिवाइस देखें।",
  kindDeviceSignedIn: "नए साइन-इन",
  kindDeviceSignedOut: "साइन आउट हुए डिवाइस",
  aDevice: "एक डिवाइस",
};
