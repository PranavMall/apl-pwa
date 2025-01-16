"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/authContext";

const withAuth = (WrappedComponent) => {
  return (props) => {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading && !user) {
        router.push("/login"); // Redirect to login if not authenticated
      }
    }, [user, loading, router]);

    if (loading || !user) {
      return <div>Loading...</div>; // Placeholder while checking auth state
    }

    return <WrappedComponent {...props} />;
  };
};

export default withAuth;
