import Header from './_components/Header';
import { UserProvider } from '@/app/_contexts/UserContext';

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider requireAuth>
      <Header />
      {children}
    </UserProvider>
  );
}
