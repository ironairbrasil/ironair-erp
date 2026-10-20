'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import styles from '@/app/legal.module.css';

type Section = { title: string; body: ReactNode };
export const privacyEmail = 'ironairbrasil@gmail.com';

export default function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: Section[] }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => { if (localStorage.getItem('ironair-theme') === 'light') setTheme('light'); }, []);
  const toggleTheme = () => setTheme(current => {
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ironair-theme', next);
    return next;
  });
  return <div className={`${styles.shell} ${theme === 'light' ? styles.light : ''}`}>
    <header className={styles.header}>
      <Link href="/login" className={styles.brand}><img src={theme === 'light' ? '/iron-seller-black.png' : '/iron-seller-white.png'} alt="Iron Seller" /></Link>
      <button type="button" className={styles.themeToggle} onClick={toggleTheme} aria-label="Alternar tema" title="Alternar tema"><Sun size={16} className={theme === 'light' ? styles.active : ''} /><Moon size={16} className={theme === 'dark' ? styles.active : ''} /></button>
    </header>
    <main className={styles.main}>
      <div className={styles.hero}><span className={styles.eyebrow}>{eyebrow}</span><h1>{title}</h1><p>{intro}</p><span className={styles.date}>Atualizado em 15 de outubro de 2026</span></div>
      <div className={styles.content}>{sections.map((section, index) => <section key={section.title} className={styles.section}><span className={styles.number}>{String(index + 1).padStart(2, '0')}</span><div><h2>{section.title}</h2><div className={styles.body}>{section.body}</div></div></section>)}</div>
      <aside className={styles.contact}><div><span className={styles.eyebrow}>Precisa de ajuda?</span><h2>Fale com a equipe Iron Seller</h2><p>Para dúvidas sobre estes documentos ou pedidos relacionados a dados pessoais, escreva para nosso canal de privacidade.</p></div><a href={`mailto:${privacyEmail}`} className={styles.contactButton}>{privacyEmail} <span aria-hidden="true">↗</span></a></aside>
    </main>
    <footer className={styles.footer}><span>© 2026 Iron Seller</span><div><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></div></footer>
  </div>;
}
