import './globals.css';

export const metadata = {
  title: 'AlphaScan Fusion Scanner',
  description: '6-layer fusion crypto screener — EMA, Momentum, ICT/SMC, Turtle Soup, Order Flow, Risk',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
