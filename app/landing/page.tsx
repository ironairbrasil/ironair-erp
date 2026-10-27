import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  CircleDollarSign,
  Gauge,
  Megaphone,
  Menu,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import styles from "./landing.module.css";

const integrations = [
  { name: "Shopify", file: "/integration-logos/shopify.webp" },
  { name: "Mercado Livre", file: "/integration-logos/mercado-livre.webp" },
  { name: "Amazon", file: "/integration-logos/amazon.webp" },
  { name: "Meta Ads", file: "/integration-logos/meta-ads.webp" },
  { name: "Mercado Pago", file: "/integration-logos/mercado-pago.png" },
  { name: "Asaas", file: "/integration-logos/asaas.png" },
];

const features = [
  { icon: BarChart3, title: "Visão de resultado", text: "Receita, lucro, margem, ticket médio e pedidos reunidos em um painel claro." },
  { icon: ShoppingCart, title: "Vendas centralizadas", text: "Acompanhe pedidos, taxas, meios de pagamento e rentabilidade por canal." },
  { icon: Boxes, title: "Estoque sob controle", text: "Monitore entradas, saídas, saldo disponível e movimentações da operação." },
  { icon: Megaphone, title: "Performance de campanhas", text: "Compare investimento, conversão e retorno para decidir com mais segurança." },
  { icon: WalletCards, title: "Despesas organizadas", text: "Classifique custos, recorrências e parcelas para enxergar o resultado real." },
  { icon: RefreshCw, title: "Devoluções visíveis", text: "Identifique retornos e perdas que afetam silenciosamente a sua margem." },
];

const faqs = [
  ["Preciso trocar as ferramentas que já uso?", "Não. O Iron Air Seller conecta os canais da sua operação e organiza as informações em uma visão única."],
  ["Consigo acompanhar mais de um canal de venda?", "Sim. A plataforma foi desenhada para centralizar uma operação multicanal e facilitar a leitura do negócio como um todo."],
  ["Meus dados ficam protegidos?", "A aplicação utiliza autenticação e separação por empresa, mantendo os dados de cada operação isolados."],
  ["A plataforma funciona no celular?", "Sim. A experiência é responsiva para você acompanhar os principais números também em telas menores."],
];

export const metadata = {
  title: "Iron Air Seller | Gestão multicanal sem achismo",
  description: "Centralize vendas, estoque, despesas e campanhas. Entenda o lucro real da sua operação em um único painel.",
};

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.logo} href="/landing" aria-label="Iron Air Seller — página inicial">
          <img src="/iron-seller-white.png" alt="Iron Air Seller" />
        </Link>
        <nav className={styles.nav} aria-label="Navegação principal">
          <a href="#plataforma">Plataforma</a>
          <a href="#recursos">Recursos</a>
          <a href="#integracoes">Integrações</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.login} href="/login">Entrar</Link>
          <Link className={styles.primaryButton} href="/onboarding">Começar agora <ArrowRight size={16} /></Link>
        </div>
        <details className={styles.mobileMenu}>
          <summary aria-label="Abrir menu"><Menu size={22} /><X size={22} /></summary>
          <div>
            <a href="#plataforma">Plataforma</a>
            <a href="#recursos">Recursos</a>
            <a href="#integracoes">Integrações</a>
            <a href="#duvidas">Dúvidas</a>
            <Link href="/login">Entrar</Link>
            <Link className={styles.primaryButton} href="/onboarding">Começar agora</Link>
          </div>
        </details>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><Sparkles size={15} /> Seu negócio inteiro, finalmente conectado</div>
          <h1>Pare de vender no escuro.<br /><span>Enxergue o lucro real.</span></h1>
          <p>Centralize vendas, estoque, despesas e campanhas em uma única visão. Menos planilhas, mais clareza para decidir e crescer.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButtonLarge} href="/onboarding">Conhecer a plataforma <ArrowRight size={19} /></Link>
            <a className={styles.secondaryButton} href="#plataforma">Ver como funciona</a>
          </div>
          <div className={styles.heroNotes}>
            <span><Check size={15} /> Configuração simples</span>
            <span><Check size={15} /> Visão multicanal</span>
            <span><Check size={15} /> Acesso responsivo</span>
          </div>
        </div>

        <div className={styles.dashboardFrame} aria-label="Prévia ilustrativa do painel Iron Air Seller">
          <div className={styles.browserBar}><i /><i /><i /><span>Visão geral da operação</span></div>
          <div className={styles.dashboardBody}>
            <aside className={styles.mockSidebar}>
              <img src="/iron-seller-icon.png" alt="" />
              {[Gauge, BarChart3, ShoppingCart, Boxes, Megaphone].map((Icon, index) => <Icon key={index} size={17} className={index === 0 ? styles.mockActive : ""} />)}
            </aside>
            <div className={styles.mockContent}>
              <div className={styles.mockHeading}><div><small>Visão geral</small><strong>Bom dia, Seller!</strong></div><span>Últimos 30 dias</span></div>
              <div className={styles.metricGrid}>
                <div><small>Faturamento</small><strong>R$ 184.920</strong><em>↑ 18,4%</em></div>
                <div><small>Lucro líquido</small><strong>R$ 42.780</strong><em>↑ 12,7%</em></div>
                <div><small>Margem</small><strong>23,1%</strong><em>saudável</em></div>
              </div>
              <div className={styles.mockLower}>
                <div className={styles.chartCard}>
                  <div className={styles.chartTitle}><span>Resultado da operação</span><small>Receita × lucro</small></div>
                  <div className={styles.chartArea}>
                    <svg viewBox="0 0 500 170" role="img" aria-label="Gráfico ilustrativo de crescimento de receita e lucro">
                      <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#9dff4f" stopOpacity=".28" /><stop offset="1" stopColor="#9dff4f" stopOpacity="0" /></linearGradient></defs>
                      <path className={styles.area} d="M0 150 C55 138 65 112 118 120 S190 70 245 92 S326 42 380 58 S455 18 500 24 L500 170 L0 170Z" />
                      <path className={styles.line} d="M0 150 C55 138 65 112 118 120 S190 70 245 92 S326 42 380 58 S455 18 500 24" />
                      <path className={styles.lineSecondary} d="M0 162 C70 156 92 140 145 147 S220 118 270 130 S350 96 410 106 S470 80 500 84" />
                    </svg>
                  </div>
                </div>
                <div className={styles.channelCard}>
                  <small>Vendas por canal</small>
                  <strong>1.284 pedidos</strong>
                  <div className={styles.donut}><span>100%</span></div>
                  <ul><li><i /> Shopify <b>54%</b></li><li><i /> Marketplaces <b>31%</b></li><li><i /> Outros <b>15%</b></li></ul>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.floatingProfit}><TrendingUp size={19} /><span><small>Lucro hoje</small><b>R$ 3.842,60</b></span></div>
        </div>
      </section>

      <section className={styles.integrationStrip} id="integracoes">
        <p>Conecte os canais que já fazem parte da sua operação</p>
        <div>{integrations.map((integration) => <span key={integration.name}><img src={integration.file} alt="" />{integration.name}</span>)}</div>
      </section>

      <section className={styles.problemSection} id="plataforma">
        <div className={styles.sectionIntro}>
          <span className={styles.kicker}>Do dado à decisão</span>
          <h2>Seus números contam uma história.<br />O Iron Air ajuda você a entendê-la.</h2>
          <p>A operação fica mais leve quando vendas, custos e performance deixam de viver em lugares separados.</p>
        </div>
        <div className={styles.steps}>
          <article><span>01</span><Zap size={25} /><h3>Conecte</h3><p>Reúna canais de venda, pagamentos e mídia em um só ambiente.</p></article>
          <article><span>02</span><Gauge size={25} /><h3>Entenda</h3><p>Visualize o que vende, o que custa e o que realmente sobra no caixa.</p></article>
          <article><span>03</span><TrendingUp size={25} /><h3>Decida</h3><p>Priorize produtos, campanhas e ações com base em resultados claros.</p></article>
        </div>
      </section>

      <section className={styles.featuresSection} id="recursos">
        <div className={styles.sectionIntro}>
          <span className={styles.kicker}>Controle completo</span>
          <h2>Tudo que você precisa para operar com confiança.</h2>
          <p>Uma visão integrada do comercial, financeiro e operacional — sem depender de uma colcha de retalhos de planilhas.</p>
        </div>
        <div className={styles.featureGrid}>
          {features.map(({ icon: Icon, title, text }) => <article key={title}><div><Icon size={22} /></div><h3>{title}</h3><p>{text}</p><a href="#cta">Saiba mais <ArrowRight size={14} /></a></article>)}
        </div>
      </section>

      <section className={styles.spotlight}>
        <div className={styles.spotlightVisual}>
          <div className={styles.phone}>
            <div className={styles.phoneTop} />
            <img src="/iron-seller-icon.png" alt="" />
            <small>Resultado de hoje</small><strong>R$ 18.430,00</strong>
            <div className={styles.phoneMetric}><span>Lucro líquido</span><b>R$ 4.291,20</b><em>+14,2%</em></div>
            <div className={styles.phoneBars}>{[42, 68, 50, 78, 62, 91, 83].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
          </div>
          <div className={styles.mobileBadge}><CircleDollarSign size={21} /><span><b>Margem saudável</b><small>23,3% na operação</small></span></div>
        </div>
        <div className={styles.spotlightCopy}>
          <span className={styles.kicker}>Onde você estiver</span>
          <h2>Os números do negócio na palma da sua mão.</h2>
          <p>Acompanhe os indicadores mais importantes sem esperar o fechamento do mês. Abra o painel, entenda o momento e aja rápido.</p>
          <ul>
            <li><Check size={18} /> Dados atualizados em uma visão única</li>
            <li><Check size={18} /> Navegação responsiva para celular e desktop</li>
            <li><Check size={18} /> Indicadores claros, sem complicação</li>
          </ul>
          <Link className={styles.textLink} href="/onboarding">Levar clareza para minha operação <ArrowRight size={17} /></Link>
        </div>
      </section>

      <section className={styles.trustSection}>
        <div><ShieldCheck size={30} /><span><strong>Dados protegidos</strong><small>Acesso seguro e separado por empresa</small></span></div>
        <div><Users size={30} /><span><strong>Feito para sellers</strong><small>Uma experiência pensada para a rotina real</small></span></div>
        <div><PackageCheck size={30} /><span><strong>Operação integrada</strong><small>Do pedido ao resultado em um só lugar</small></span></div>
      </section>

      <section className={styles.faqSection} id="duvidas">
        <div className={styles.sectionIntro}><span className={styles.kicker}>Perguntas frequentes</span><h2>Sem letras miúdas. Vamos direto ao ponto.</h2></div>
        <div className={styles.faqList}>{faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <section className={styles.cta} id="cta">
        <div><span className={styles.kicker}>Sua próxima decisão começa aqui</span><h2>Troque o achismo por uma visão clara da sua operação.</h2><p>Conecte seus canais e transforme dados espalhados em decisões mais rápidas e rentáveis.</p></div>
        <Link className={styles.ctaButton} href="/onboarding">Começar agora <ArrowRight size={20} /></Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}><img src="/iron-seller-white.png" alt="Iron Air Seller" /><p>Gestão multicanal para quem quer crescer com controle.</p></div>
        <div><strong>Produto</strong><a href="#plataforma">Plataforma</a><a href="#recursos">Recursos</a><a href="#integracoes">Integrações</a></div>
        <div><strong>Legal</strong><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos de uso</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></div>
        <div><strong>Acesso</strong><Link href="/login">Entrar</Link><Link href="/onboarding">Criar conta</Link></div>
        <p className={styles.copyright}>© {new Date().getFullYear()} Iron Air Seller. Todos os direitos reservados.</p>
      </footer>
    </main>
  );
}
