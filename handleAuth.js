import { handleErrorResponse } from "./handleErrors.js";
import axios from "axios";

export async function handleAuth(req, res, next) {
  // for a simple way of authenticating, we are checking the application ID of this
  // deployed neru application and are checking if that app exists in the account
  // that is used for authentication. This means only the api key that deployed this
  // app can be used for auth.

  try {
    const API_APPLICATION_ID = process.env.API_APPLICATION_ID;
    const response = await axios.get(
      `https://api.nexmo.com/v2/applications/${API_APPLICATION_ID}`,
      { headers: { Authorization: `${req.headers["authorization"]}` } }
    );
    if (API_APPLICATION_ID && response?.data?.id === API_APPLICATION_ID) {
      next();
    } else throw new Error("Invalid api key and secret");
  } catch (e) {
    console.log("axios response: ", e?.response?.data);
    return handleErrorResponse(e, res, "Auth error.");
  }
}
