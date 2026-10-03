import type { Catalog } from "../en/index";

export const help: Catalog["help"] = {
  title: "Ajuda e confiança",
  intro: "O que o Kawase pode e não pode fazer com seu dinheiro, onde ele fica e como sair sem o Kawase.",
  canTitle: "O que o Kawase pode fazer",
  allowanceTitle: "Só o que você assinou",
  allowanceBody:
    "O Kawase só move dinheiro por você dentro do limite diário que você assinou com o Face ID: por token, até esse valor por dia, até expirar. Quem garante o limite é a Arc, não os servidores do Kawase.",
  asksTitle: "Todo o resto pede você",
  asksBody:
    "Acima do limite, um destinatário novo ou parecido com outro, trocas, operações de trading, pontes e saques esperam seu Face ID no cartão.",
  pauseTitle: "Pause ou revogue quando quiser",
  pauseBody:
    "“Pausar tudo” para o Kawase e suas automações na hora. Revogar encerra uma permissão na Arc, para que ela não possa ser usada de novo.",
  limits: "Carteira e limites",
  neverTitle: "O que ele nunca pode fazer",
  neverBody:
    "Pegar mais do que seu limite, pagar um endereço que você não indicou ou mover dinheiro sem um registro em Atividade dizendo por quê.",
  whereTitle: "Onde seu dinheiro fica",
  walletTitle: "Na sua própria carteira",
  walletBody: "Seu dinheiro está na sua própria carteira na Arc, não numa conta no Kawase.",
  copy: "Copiar",
  copied: "Copiado",
  keyTitle: "Sua chave",
  keyBody:
    "A chave da sua carteira é criada e guardada pela Turnkey em hardware seguro. O Kawase nunca a vê; seu Face ID ou sua chave-senha a desbloqueia.",
  codeTitle: "Recursos inteligentes no seu endereço",
  codeBody:
    "Seu endereço roda o código aberto DeleGator da MetaMask (EIP-7702), então várias etapas vão num só Face ID e seus limites são garantidos. Ele nunca move dinheiro sozinho.",
  leaveTitle: "Sair sem o Kawase",
  exportTitle: "Exporte sua carteira",
  exportBody: "Exporte a chave da sua carteira e guarde-a com segurança. Ela funciona sem o Kawase.",
  export: "Exportar",
  anyWalletTitle: "Use qualquer carteira",
  anyWalletBody: "Importe a chave na MetaMask, Rabby ou qualquer carteira EVM e adicione {{network}} com estes dados:",
  chainId: "ID da rede",
  rpc: "RPC",
  explorer: "Explorador",
  gasToken: "Taxas pagas em",
  statusTitle: "O Kawase está funcionando?",
  statusUnread: "Não foi possível ler o status agora.",
  askTitle: "Pergunte e leia mais",
  chatTitle: "Pergunte ao Kawase",
  chatBody: "Pergunte no chat o que é alguma coisa, por que o dinheiro se moveu ou se a Arc está funcionando.",
  open: "Abrir",
  docsTitle: "Leia a documentação",
  reportTitle: "Relatar um problema",
  reportBody: "Abra um relato no GitHub. Nunca compartilhe sua chave ou frase de recuperação com ninguém.",
  statusLinkTitle: "Página de status",
};
