import Header from './_components/Header';
import SideMenu from './_components/SideMenu';
import { UserProvider } from '@/app/_contexts/UserContext';
import { StaffOpeningProvider } from '@/app/_contexts/StaffOpeningContext';
import ManualPlacementManager from '@/app/_components/ManualPlacementManager';

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
        <ManualPlacementManager />
      </StaffOpeningProvider>
    </UserProvider>
  );
}
