import type { Preview } from "@storybook/react-vite";
import { GlobalTheme } from "@carbon/react";
import "../src/carbon.scss";

const preview: Preview = {
  decorators: [(Story) => <GlobalTheme theme="g10"><Story /></GlobalTheme>],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
