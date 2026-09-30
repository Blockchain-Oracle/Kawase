// Sets the reading direction for everything inside it, without restarting the app (so the language can be
// changed in the app, not only in the phone's settings). Two things are needed: the layout direction on a
// real view, and Uniwind's own direction context for the `rtl:` classes.
import { View, type ViewProps } from "react-native";
import { LayoutDirection } from "uniwind";

type DirectionProps = ViewProps & {
  rtl: boolean;
};

function Direction({ rtl, style, ...props }: DirectionProps) {
  return (
    <LayoutDirection rtl={rtl}>
      <View style={[{ direction: rtl ? "rtl" : "ltr" }, style]} {...props} />
    </LayoutDirection>
  );
}

export { Direction };
export type { DirectionProps };
