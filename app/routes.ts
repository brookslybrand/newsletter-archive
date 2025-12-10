import { route } from "@remix-run/fetch-router";

export let routes = route({
  home: "/",
  newsletter: "/newsletter/:number",
  newsletterImage: "/newsletter/:number/image/:filename",
  healthcheck: "/healthcheck",
});
