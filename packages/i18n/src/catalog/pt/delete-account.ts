import type { Catalog } from "../en/index";

export const deleteAccount: Catalog["deleteAccount"] = {
  title: "Excluir conta",
  body: "Sua carteira continua sendo sua. O Kawase apaga o que guarda sobre você: contatos, conversas, caixa de entrada e configurações.",
  holdings: "O que sua conta tem",
  agentWallet: "Carteira do agente: {{amount}} (devolvido primeiro para sua carteira)",
  revoke: "Desligue o que o Kawase pode fazer",
  revokeOn: "Revogar em {{network}} ({{count}})",
  revokePrompt: "Revogar as permissões do Kawase",
  revoked: "Revogado na blockchain",
  revokeFailed: "A revogação não terminou. Tente de novo.",
  noGrants: "Nada para revogar.",
  revokeNote:
    "Revogar exige um pouco de USDC para a taxa, então faça isso antes de mover seu dinheiro. O que não for revogado não poderá ser usado depois que a conta for excluída.",
  takeOut: "Tire seu dinheiro",
  takeOutBody:
    "Envie para outro lugar ou exporte a carteira para usá-la em outro app. Você também pode deixá-lo lá: a carteira continua sendo sua.",
  send: "Enviar",
  confirm: "Digite {{handle}} para confirmar",
  delete: "Excluir minha conta",
  done: "Sua conta foi excluída",
  failed: "A exclusão não funcionou. Nada foi apagado.",
  after:
    "Seu @nome fica reservado por 30 dias para ninguém mais pegá-lo. Se você entrar de novo depois, começa uma conta nova com a mesma carteira.",
  holdToDelete: "Segure para excluir minha conta",
  typeFirst: "Digite {{handle}} primeiro",
  keepHolding: "Continue segurando",
  stillWorks: "Nada foi excluído. Sua conta funciona como antes.",
  loading: "Verificando o que sua conta tem",
  agentWalletRow: "Carteira do agente",
  agentWalletBack: "Volta primeiro para sua carteira",
  needsWallet: "Configure sua carteira",
};
