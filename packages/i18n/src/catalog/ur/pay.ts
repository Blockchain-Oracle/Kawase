import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "‏{{amount}} ادا کریں",
  signInToPay: "ادا کرنے کے لیے سائن ان کریں",
  otherWallet: "دوسرے والیٹ سے ادا کریں",
  otherWalletBody: "‏{{network}} پر اس پتے پر بالکل {{amount}} بھیجیں۔ پہنچتے ہی درخواست ادا شدہ دکھائی دے گی۔",
  ownRequest: "یہ آپ کی اپنی درخواست ہے۔ لنک اسے بھیجیں جسے ادا کرنا ہے۔",
  paidTitle: "پہلے ہی ادا ہو چکی",
  paidBody: "اس درخواست کی ادائیگی ہو چکی۔ مزید کچھ نہیں کرنا۔",
  canceledTitle: "درخواست منسوخ ہو گئی",
  canceledBody: "‏{{name}} نے یہ درخواست منسوخ کر دی۔ کچھ ادا نہیں کرنا۔",
  expiredTitle: "درخواست کی میعاد ختم",
  expiredBody: "‏یہ لنک اب کھلا نہیں۔ {{name}} سے نیا لنک مانگیں۔",
  notFoundTitle: "درخواست نہیں ملی",
  notFoundBody: "لنک چیک کریں، یا نیا لنک مانگیں۔",
  loadFailed: "یہ درخواست لوڈ نہیں ہو سکی۔",
};
