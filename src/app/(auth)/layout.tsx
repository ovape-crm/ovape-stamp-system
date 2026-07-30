import Header from './_components/Header';
import SideMenu from './_components/SideMenu';
import { UserProvider } from '@/app/_contexts/UserContext';
import { StaffOpeningProvider } from '@/app/_contexts/StaffOpeningContext';

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider requireAuth>
      <StaffOpeningProvider>
        <div className="hidden header:block">
          <Header />
        </div>
        <SideMenu>{children}</SideMenu>
      </StaffOpeningProvider>
    </UserProvider>
  );
}
