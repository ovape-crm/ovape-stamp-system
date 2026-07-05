import Header from './_components/Header';
import SideMenu from './_components/SideMenu';
import { UserProvider } from '@/app/_contexts/UserContext';

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider requireAuth>
      <div className="hidden header:block">
        <Header />
      </div>
      <SideMenu>{children}</SideMenu>
    </UserProvider>
  );
}
