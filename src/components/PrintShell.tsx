import { useEffect, useRef, useState, type ReactNode } from 'react';
import { signedUrl, type DocBusiness } from '../api';
import { useAsync } from '../hooks';
import type { Session } from '../session';
import '../print/print.css';

const FALLBACK_LOGO = '/powerant-logo.jpg';

interface PrintShellProps {
  session: Session;
  business: DocBusiness | null;
  /** Right side of the header: document kind, number, dates. */
  title: ReactNode;
  format: 'a4' | 'a5';
  /** Print as soon as the document and its logo are ready (?auto=1). */
  auto: boolean;
  cancelled?: boolean;
  /** Links and buttons above the sheet (never printed). */
  toolbar: ReactNode;
  /** Shown above the sheet on screen only (e.g. "Sale posted"). */
  notice?: ReactNode;
  children: ReactNode;
}

/**
 * One printable sheet: logo and business block, the document's own title, and
 * the body. A4 by default; the A5 receipt sets @page A5 while it is on screen.
 */
function PrintShell({ session, business, title, format, auto, cancelled, toolbar, notice, children }: PrintShellProps) {
  // Documents without a business (e.g. a payment with no location) use the first business on file.
  const fallback = session.businesses[0];
  const biz: DocBusiness | null =
    business ??
    (fallback
      ? {
          id: fallback.id,
          name: fallback.trading_name?.trim() || fallback.legal_name,
          legal_name: fallback.legal_name,
          address: null,
          phone: null,
          logo_path: fallback.logo_path,
          invoice_footer: fallback.invoice_footer,
          tax_registered: fallback.tax_registered,
        }
      : null);

  const logoPath = biz?.logo_path ?? null;
  const logo = useAsync(() => (logoPath ? signedUrl('branding', logoPath) : Promise.resolve(null)), [logoPath]);
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoSettled, setLogoSettled] = useState(false);
  const src = logo.loading ? null : logo.data && !logoFailed ? logo.data : FALLBACK_LOGO;

  // A5 receipt: page size only while this sheet is mounted.
  useEffect(() => {
    if (format !== 'a5') return;
    const style = document.createElement('style');
    style.textContent = '@media print { @page { size: A5; margin: 8mm; } }';
    document.head.appendChild(style);
    return () => style.remove();
  }, [format]);

  // Print once, after the logo has loaded (or failed).
  const printed = useRef(false);
  useEffect(() => {
    if (!auto || !logoSettled || printed.current) return;
    printed.current = true;
    const t = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(t);
  }, [auto, logoSettled]);

  const showLegal = biz?.legal_name && biz.name && biz.legal_name.trim() !== biz.name.trim();

  return (
    <>
      <div className="doc-toolbar no-print">{toolbar}</div>
      {notice && <div className="no-print">{notice}</div>}
      <article className={`doc ${format}`}>
        {cancelled && <div className="challan-cancelled">CANCELLED</div>}
        <header className="doc-head">
          <div className="doc-brand">
            {src && (
              <img
                className="doc-logo"
                src={src}
                alt=""
                onLoad={() => setLogoSettled(true)}
                onError={() => {
                  if (src !== FALLBACK_LOGO) setLogoFailed(true);
                  else setLogoSettled(true);
                }}
              />
            )}
            <div>
              <div className="doc-business">{biz?.name?.trim() || biz?.legal_name || 'Powerant'}</div>
              {showLegal && <div className="doc-small">{biz?.legal_name}</div>}
              {biz?.address && <div className="doc-small">{biz.address}</div>}
              {biz?.phone && <div className="doc-small">Phone: {biz.phone}</div>}
              {biz?.tax_registered && (biz.ntn || biz.strn) && (
                <div className="doc-small">
                  {biz.ntn && <>NTN: {biz.ntn}</>}
                  {biz.ntn && biz.strn && ' · '}
                  {biz.strn && <>STRN: {biz.strn}</>}
                </div>
              )}
            </div>
          </div>
          <div className="doc-title">{title}</div>
        </header>
        {children}
      </article>
    </>
  );
}

export default PrintShell;

/** Footer texts (terms, business footer, receipt footer), each only when set. */
export function DocFooterTexts({ texts }: { texts: (string | null | undefined)[] }) {
  const shown = texts.map((t) => t?.trim()).filter((t): t is string => Boolean(t));
  if (shown.length === 0) return null;
  return (
    <div className="doc-section">
      {shown.map((t, i) => (
        <p key={i} className="doc-text">
          {t}
        </p>
      ))}
    </div>
  );
}

/** Two signature lines. */
export function DocSignatures({ left, right }: { left: string; right: string }) {
  return (
    <footer className="doc-sign">
      <div>
        <div className="doc-sign-line" />
        {left}
      </div>
      <div>
        <div className="doc-sign-line" />
        {right}
      </div>
    </footer>
  );
}
