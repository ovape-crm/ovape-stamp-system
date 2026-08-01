import Link from 'next/link';
import Image from 'next/image';

const Logo = () => {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="relative flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-lg">
        <div className="relative h-[68px] w-[68px]">
          <Image
            src="/logo.PNG"
            alt="OSS Logo"
            fill
            sizes="68px"
            className="object-contain"
          />
        </div>
      </div>
    </Link>
  );
};

export default Logo;
