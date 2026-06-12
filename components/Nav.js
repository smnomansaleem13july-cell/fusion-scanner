'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TOOLS = [
  { href: '/', label: 'Fusion', desc: '6-layer composite' },
  { href: '/edgerank', label: 'EdgeRank', desc: 'Momentum ranking' },
  { href: '/turtle', label: 'Turtle Soup', desc: 'Liquidity grab' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="toolnav">
      {TOOLS.map((t) => (
        <Link key={t.href} href={t.href} className={'toolnav-link' + (path === t.href ? ' active' : '')}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
