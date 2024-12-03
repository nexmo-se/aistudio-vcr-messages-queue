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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.send("App is running.");
});
app.get("/_/metrics", async (req, res) => {
  res.sendStatus(200);
});

app.get("/_/health", async (req, res) => {
  res.sendStatus(200);
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
app.post("/queues/additem/:name", handleAuth, async (req, res) => {
  const { name } = req.params;

  // check if queue name was provided
  if (!name) return res.status(500).send("No name found.");

  try {
    const session = neru.createSession();
    const queueApi = new Queue(session);

    // create a new queue item with neru queue provider
    await queueApi
      .enqueueSingle(name, {
        originalBody: req.body,
        aiXVgaiKey: AI_X_VGAI_KEY,
      })
      .execute();

    // send http response
    return res.status(200).json({ success: true });
  } catch (e) {
    return handleErrorResponse(e, res, "Adding queue item.");
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

app.listen(PORT, () => {
  console.log(
    `Listening on ${process.env.NERU_APP_URL || "http://localhost:" + PORT} ...`
  );
});
