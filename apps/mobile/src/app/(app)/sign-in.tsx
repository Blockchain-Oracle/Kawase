// The deep-link entry for signing in: it opens the sign-in sheet over home rather than a page of its own.
import { Redirect } from "expo-router";
import * as React from "react";

import { useSignIn } from "@/sign-in/sign-in-provider";

export default function SignInRoute() {
  const signIn = useSignIn();
  React.useEffect(() => {
    signIn.open();
    // Once, on arrival.
  }, []);
  return <Redirect href="/" />;
}
