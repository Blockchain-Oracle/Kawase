import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "‏{{name}} پر نیا سائن ان",
  deviceSignedInBody:
    "‏{{platform}} · {{location}}۔ اگر یہ آپ نہیں تھے تو ڈیوائسز میں اسے سائن آؤٹ کریں اور “سب روکیں” آن کریں۔",
  deviceSignedInBodyNoPlace: "‏{{platform}}۔ اگر یہ آپ نہیں تھے تو ڈیوائسز میں اسے سائن آؤٹ کریں اور “سب روکیں” آن کریں۔",
  deviceSignedOutTitle: "‏{{name}} سے سائن آؤٹ ہو گیا",
  deviceSignedOutBody: "اب یہ آپ کا اکاؤنٹ استعمال نہیں کر سکتا۔ اگر یہ آپ نے نہیں کیا تو ابھی ڈیوائسز دیکھیں۔",
  invoiceDueSoonTitle: "انوائس {{number}} کی آخری تاریخ کل ہے",
  invoiceDueTodayTitle: "انوائس {{number}} کی آخری تاریخ آج ہے",
  invoiceDueBody: "‏{{client}} کے ذمے {{amount}} ہیں۔",
  invoiceOverdueTitle: "انوائس {{number}} کی تاریخ گزر گئی",
  invoiceOverdueBody: "‏{{client}} کے ذمے اب بھی {{amount}} ہیں (آخری تاریخ {{date}} تھی)۔",
  kindDeviceSignedIn: "نئے سائن ان",
  kindDeviceSignedOut: "سائن آؤٹ ہونے والی ڈیوائسز",
  kindInvoiceDue: "قریب الادا انوائسز",
  kindInvoiceOverdue: "تاریخ گزری انوائسز",
  aDevice: "ایک ڈیوائس",
};
