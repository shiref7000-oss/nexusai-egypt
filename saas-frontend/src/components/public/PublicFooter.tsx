import { Link } from 'react-router-dom';
import { PUBLIC_ROUTES, SITE } from '@/config/site';

export function PublicFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-surface">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="font-display text-lg font-semibold text-foreground">{SITE.companyName}</p>
            <p className="mt-2 text-sm text-zinc-500 leading-relaxed max-w-xs">
              AI operating system for eCommerce — WhatsApp COD automation, orders, and customer
              communication.
            </p>
            <a
              href={`mailto:${SITE.supportEmail}`}
              className="mt-4 inline-block text-sm text-brand hover:underline"
            >
              {SITE.supportEmail}
            </a>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Product</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>
                <Link to={PUBLIC_ROUTES.home} className="hover:text-foreground transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to={PUBLIC_ROUTES.pricing} className="hover:text-foreground transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to={PUBLIC_ROUTES.about} className="hover:text-foreground transition-colors">
                  About
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Legal</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>
                <Link to={PUBLIC_ROUTES.privacy} className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to={PUBLIC_ROUTES.terms} className="hover:text-foreground transition-colors">
                  Terms & Conditions
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-3">Help</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>
                <Link to={PUBLIC_ROUTES.support} className="hover:text-foreground transition-colors">
                  Support
                </Link>
              </li>
              <li>
                <Link to={PUBLIC_ROUTES.contact} className="hover:text-foreground transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link to={PUBLIC_ROUTES.login} className="hover:text-foreground transition-colors">
                  Login
                </Link>
              </li>
              <li>
                <Link to={PUBLIC_ROUTES.signup} className="hover:text-foreground transition-colors">
                  Sign Up
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-8 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
          <p>
            © {new Date().getFullYear()} {SITE.legalName}. All rights reserved.
          </p>
          <p>
            {SITE.address.line1}, {SITE.address.country} ·{' '}
            <a href={SITE.website} className="hover:text-zinc-400">
              {SITE.domain}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
