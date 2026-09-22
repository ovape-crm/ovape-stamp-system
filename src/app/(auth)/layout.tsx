import Header from './_components/Header';
import SideMenu from './_components/SideMenu';
import { UserProvider } from '@/app/_contexts/UserContext';
import { StaffOpeningProvider } from '@/app/_contexts/StaffOpeningContext';
import { ModalProvider } from '@/app/_contexts/ModalContext';
import ManualPlacementManager from '@/app/_components/ManualPlacementManager';
import RequiredSystemNoticeProvider from './_components/RequiredSystemNoticeProvider';

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider requireAuth>
      <ModalProvider>
        <StaffOpeningProvider>
          <RequiredSystemNoticeProvider>
            <div className="hidden header:block">
              <Header />
            </div>
            <SideMenu>{children}</SideMenu>
            <ManualPlacementManager />
          </RequiredSystemNoticeProvider>
        </StaffOpeningProvider>
      </ModalProvider>
    </UserProvider>
  );
}
