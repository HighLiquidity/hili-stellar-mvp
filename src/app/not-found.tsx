import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="auth-page">
      <section className="auth-card auth-card--form">
        <div className="auth-card__header">
          <div className="auth-card__title-group">
            <h1>404</h1>
            <p className="surface__lead">Página não encontrada.</p>
          </div>
        </div>
        <p>
          <Link href="/">Voltar ao início</Link>
        </p>
      </section>
    </main>
  );
}
