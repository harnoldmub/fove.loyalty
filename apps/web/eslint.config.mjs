import next from "eslint-config-next";

const config = [
  ...next,
  {
    ignores: [".next/**", "public/**"],
  },
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
];

export default config;
