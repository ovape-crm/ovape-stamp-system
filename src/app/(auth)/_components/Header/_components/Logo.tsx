import Link from 'next/link';
import Image from 'next/image';

const Logo = () => {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="w-15 h-15 rounded-lg flex items-center justify-center overflow-hidden">
        <Image
          src="/logo.PNG"
          alt="OSS Logo"
          width={50}
          height={50}
          className="object-contain"
        />
      </div>
    </Link>
  );
};

export default Logo;
