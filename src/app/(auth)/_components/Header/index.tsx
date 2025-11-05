import Logo from './_components/Logo';
import Nav from './_components/Nav';
import UserInfo from './_components/UserInfo';

const Header = () => {
  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-brand-50 via-brand-100 to-brand-50 border-b border-brand-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-20 flex items-center justify-between">
          {/* 로고 & 네비게이션 */}
          <div className="flex items-center gap-8">
            <Logo />
            <Nav />
          </div>

          {/* 유저 정보 */}
          <UserInfo />
        </div>
      </div>
    </header>
  );
};

export default Header;
