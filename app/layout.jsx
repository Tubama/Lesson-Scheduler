import "./globals.css";

export const metadata = {
  title: "Mia's Music Studio Scheduler",
  description: "Recurring music lesson registration for school year and summer schedules."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
