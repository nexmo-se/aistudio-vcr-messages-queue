import express from "express";
import { neru, Queue } from "neru-alpha";
import axios from "axios";
import { handleErrorResponse } from "./handleErrors.js";
import { handleAuth } from "./handleAuth.js";

const app = express();

const PORT = process.env.NERU_APP_PORT || 3000;

const DEFAULT_MPS = process.env.defaultMsgPerSecond || 1;
const DEFAULT_MAX_INFLIGHT = process.env.defaultMaxInflight || 30;
const AI_AGENT_REGION = process.env.AI_AGENT_REGION;
const AI_X_VGAI_KEY = process.env.AI_X_VGAI_KEY;
const WEBHOOK_STATUS_URL = process.env.WEBHOOK_STATUS_URL;
const FORWARD_URL = process.env.FORWARD_URL;
const STUDIO_AI_INBOUND_URL = process.env.STUDIO_AI_INBOUND_URL;

if (!WEBHOOK_STATUS_URL) {
  console.log("Missing WEBHOOK_STATUS_URL:", WEBHOOK_STATUS_URL);
}

if (!FORWARD_URL) {
  console.log("Missing FORWARD_URL:", FORWARD_URL);
}

if (!STUDIO_AI_INBOUND_URL) {
  console.log("Missing STUDIO_AI_INBOUND_URL:", STUDIO_AI_INBOUND_URL);
}

const state = neru.getInstanceState();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Utility function to sanitize keys
const sanitizeKey = (key) => key.replace(/\+/g, "");

app.get("/", (req, res) => {
  res.send("App is running.");
});
app.get("/_/metrics", async (req, res) => {
  res.sendStatus(200);
});

app.get("/_/health", async (req, res) => {
  res.sendStatus(200);
});

// Is triggered via Studio AI Vonage Application Inbound URL. Pleae set in API Developer Dashboard.
// Set in VCR_URL/webhooks/inbound
app.post("/webhooks/inbound", async (req, res) => {
  console.log("/webhooks/inbound:", req.body);

  // Forward the request to the FORWARD_URL & STUDIO_AI_INBOUND_URL
  if (FORWARD_URL && STUDIO_AI_INBOUND_URL) {
    try {
      // Forward to FORWARD_URL
      let forwardUrlResp = await axios({
        method: req.method,
        url: FORWARD_URL,
        headers: {
          ...req.headers,
          host: new URL(FORWARD_URL).host,
        },
        data: req.body,
      });

      // Forward to STUDIO_AI_INBOUND_URL
      let studioApiInboundResp = await axios({
        method: req.method,
        url: STUDIO_AI_INBOUND_URL,
        headers: {
          ...req.headers,
          host: new URL(STUDIO_AI_INBOUND_URL).host,
        },
        data: req.body,
      });

      console.log("FORWARD_URL Response:", forwardUrlResp.data);

      let studioAiResponse = {
        status: studioApiInboundResp.status,
        statusText: studioApiInboundResp.statusText,
        data: studioApiInboundResp.data,
      };

      console.log("STUDIO_AI_INBOUND_URL Response:", studioAiResponse);
      return res.status(200).json({
        forwardUrlResponse: forwardUrlResp.data,
        studioApiInboundResponse: studioAiResponse,
      });
    } catch (error) {
      let errorResponse = error.response ? error.response.data : error.message;
      console.log("ERROR /webhooks/inbound:", errorResponse);

      return res.status(500).json(errorResponse);
    }
  } else {
    return res
      .status(500)
      .json({ error: "FORWARD_URL or STUDIO_API_INBOUND_URL is not defined" });
  }
});

// For Internal testing
app.post("/status", async (req, res) => {
  console.log("/status:", req.body);
  res.status(200).json({ success: true });
});

// For Internal testing
app.post("/forward-url", async (req, res) => {
  console.log("/forward-url:", req.body);

  // respond with 200 OK and req.body
  res.status(200).json({ success: true, body: req.body });
});

// Is defined in Reqeust body to /queues/additem/:name; VCR_URL/webhooks/status
// For testing purposes here, we send it to the VCR_URL/status for logging.
app.post("/webhooks/status", async (req, res) => {
  console.log("/webhooks/status:", req.body);
  const { to } = req.body;

  if (!to) return res.status(500).send("Missing 'to' key in body.");

  try {
    // Retrieve the state for the given "to" key
    const sanitizedTo = sanitizeKey(to); // Sanitize the "to" key
    const queueItem = await state.get(sanitizedTo);

    if (!queueItem)
      return res.status(404).send("No state found for the given 'to' key.");

    let statusPayload = req.body;

    // Update client_ref if it exists
    if (queueItem.client_ref) {
      statusPayload.client_ref = queueItem.client_ref;
    } else {
      console.log("No client_ref available in queueItem.");
    }

    if (!WEBHOOK_STATUS_URL)
      return res.status(400).send("Missing WEBHOOK_STATUS_URL.");

    console.log("Sending payload to WEBHOOK_STATUS_URL:", statusPayload);
    await axios.post(WEBHOOK_STATUS_URL, statusPayload);

    res.status(200).json({ success: true });
  } catch (error) {
    console.log(
      "ERROR webhooks/status:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({
      success: false,
      error: "Error webhooks/status",
      details: error.response ? error.response.data : error.message,
    });
  }
});

// api to create a queue
app.post("/queues/create", handleAuth, async (req, res) => {
  const { name, maxInflight, msgPerSecond } = req.body;

  // check if queue name was provided
  if (!name) return res.status(500).send("No name found.");

  try {
    const session = neru.createSession();
    const queueApi = new Queue(session);

    // create a new queue item with neru queue provider
    await queueApi
      .createQueue(name, `/queues/${name}`, {
        maxInflight: maxInflight || DEFAULT_MAX_INFLIGHT,
        msgPerSecond: msgPerSecond || DEFAULT_MPS,
        active: true,
      })
      .execute();

    // send http response
    return res.status(201).json({
      success: true,
      name,
      maxInflight: maxInflight || DEFAULT_MAX_INFLIGHT,
      msgPerSecond: msgPerSecond || DEFAULT_MPS,
    });
  } catch (e) {
    return handleErrorResponse(e, res, "Creating a new queue.");
  }
});

// api to add an item to a queue
// call this instead of messages api with the same payload but without required headers
// Add item to a queue and store in state
app.post("/queues/additem/:name", handleAuth, async (req, res) => {
  const { name } = req.params;
  const { to, status_url } = req.body;

  if (!name) return res.status(500).send("Missing queue name: " + name);
  if (!to) return res.status(500).send("Missing 'to' key in body: " + to);
  if (!status_url)
    return res.status(500).send("Missing 'status_url': " + status_url);

  try {
    // Store request body in state with "to" as key
    const sanitizedTo = sanitizeKey(to); // Sanitize the "to" key
    const queueItem = await state.set(sanitizedTo, req.body);
    console.log("queueItem:", queueItem);

    // Set an expiry time for the stored request
    await state.expire(sanitizedTo, 7200); // 7200 seconds = 2 hours

    const session = neru.createSession();
    const queueApi = new Queue(session);

    // Enqueue the item
    await queueApi
      .enqueueSingle(name, {
        originalBody: req.body,
        aiXVgaiKey: process.env.AI_X_VGAI_KEY,
      })
      .execute();

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error adding item to queue",
      details: error.response ? error.response.data : error.message,
    });
    console.log(error.response ? error.response.data : error.message);
  }
});

// api to delete a queue
app.delete("/queues/:name", handleAuth, async (req, res) => {
  const { name } = req.params;

  // check if queue name was provided
  if (!name) return res.sendStatus(500);

  try {
    const session = neru.createSession();
    const queueApi = new Queue(session);

    // delete queue
    await queueApi.deleteQueue(name).execute();

    // send http response
    return res.status(200).json({ success: true });
  } catch (e) {
    return handleErrorResponse(e, res, "Nothing to delete.");
  }
});

// this will be internally called when a queue item is executed
app.post("/queues/:name", async (req, res) => {
  const { name } = req.params;

  const { originalBody, aiXVgaiKey } = req.body;

  console.log("Webhook called by Queue with Name: ", name);

  // internal authentication, so no one can call the internal endpoint from outside world
  if (aiXVgaiKey !== AI_X_VGAI_KEY)
    return res.status(401).json({ success: false, error: "Unauthorized." });

  try {
    let data = JSON.stringify(originalBody);

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: AI_AGENT_REGION,
      headers: {
        "X-Vgai-Key": AI_X_VGAI_KEY,
        "Content-Type": "application/json",
      },
      data: data,
    };

    axios
      .request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        return res.status(200).json({ success: true });
      })
      .catch((error) => {
        console.log(error);
        return res.status(500).json({ success: false });
      });
  } catch (e) {
    return handleErrorResponse(e, res, "Executing Queue Item");
  }
});

// global error-handling middleware to log unhandled errors.
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({ success: false, error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(
    `Listening on ${
      process.env.VCR_INSTANCE_PUBLIC_URL || "http://localhost:" + PORT
    }`
  );
});
