import type { Catalog } from "../en/index";

export const errors: Catalog["errors"] = {
  offline: "Você está offline. Mostrando o que o Kawase sabia por último.",
  serverTrouble: "Não é possível falar com o Kawase agora. Mostrando as últimas informações.",
  storageUnavailable:
    "O armazenamento seguro está indisponível. Desbloqueie o dispositivo e tente novamente. Sua conta não foi redefinida.",
  offlineAction: "Sem conexão. Verifique sua internet e tente de novo.",
  expiredCode: "Esse código expirou. Peça um novo.",
  rateLimited: "Foram enviados códigos demais. Espere alguns minutos e tente de novo.",
  signInFailed: "Não foi possível entrar. Tente de novo.",
  walletFailed: "Você entrou, mas sua carteira não foi criada. Tente de novo — nada foi perdido.",
  resendIn: "Enviar um novo código em {{seconds}} s",
  startFailed: "O Kawase não conseguiu começar. Verifique sua conexão e tente de novo.",
  walletLoadFailed: "Não foi possível carregar sua carteira.",
  scopeLoadFailed: "Não foi possível preparar seu limite diário.",
  scopeRefreshed: "O limite diário foi atualizado. Leia de novo e depois aprove.",
  notSigned: "Nada foi assinado.",
  biometricUnavailable: "Ative Face ID, Touch ID, digital ou um código nos Ajustes do celular para aprovar.",
  biometricUnavailableWeb: "Para aprovar na web é preciso o email da sua conta. Entre com seu email para continuar.",
  biometricUnavailableAndroid:
    "Configure uma digital ou um bloqueio de tela nas Configurações do celular para aprovar.",
  biometricFailed: "Não correspondeu. Nada foi assinado. Tente de novo.",
  tryAgainIn: "Tente de novo em {{time}}",
  deviceProofNeeded: "Entre de novo neste telefone para aprovar. Nada foi enviado.",
};
