import Link from 'next/link';
import Image from 'next/image';

const Logo = () => {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="relative flex h-15 w-15 items-center justify-center overflow-hidden rounded-lg">
        <Image
          src="/logo.PNG"
          alt="OSS Logo"
          fill
          sizes="60px"
          className="object-contain p-[5px]"
        />
      </div>
    </Link>
  );
};

export default Logo;
