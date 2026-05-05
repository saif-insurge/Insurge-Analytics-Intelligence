import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-[radial-gradient(ellipse_at_center,_#141418_0%,_#0a0a0f_70%)]">
      <div className="mb-10 flex flex-col items-center">
        <p className="text-[11px] font-medium tracking-[0.15em] uppercase text-text-muted mb-5">
          Tracking intelligence by
        </p>
        <Image src="/logo.png" alt="Insurge" width={160} height={160} />
      </div>
      <SignUp />
    </main>
  );
}
