# Vonage AI Studio Vonage Cloud Runtime Queue WhatsApp Messages API

The problem is that at this time Vonage AI Studio has a limit of 1 POST request per second. To remedy this, we intergrate Vonage Cloud Runtime (VCR) to queue the outbound Whatsapp Messages and continue to send them out at the same rate that satisfies AI Studio.

For example, if you were to make sequential POST requests to AI Studio `https://studio-api-us.ai.vonage.com/messaging/conversation`, you would receive the error below. This would not only fail to send your WhatsApp message, but would not offer you a retry mechanism. So by adding VCR into the picture, we now would allow a 3 Times Retry if it failes initially.

```js
{
    "message": ""Too Many Requests" Please reach studio team to increase rate limit at ai.support@vonage.com."
}
```

## Initial Setup

1. [Clone this Repository](https://github.com/nexmo-se/aistudio-vcr-messages-queue.git)
2. [Install Vonage Cloud Runtime CLI](https://developer.vonage.com/en/vonage-cloud-runtime/getting-started/working-locally?source=vonage-cloud-runtime)
3. Configure your CLI `vcr configure`.
4. Upgrade your CLI `vcr upgrade`
5. Run `vcr app create --name "aistudio-vcr-queue-demo"` and copy application id (only if you don't have an app yet)
6. Run `cp vcr.yml.example vcr.yml` and copy application id and any missing env variables into vcr.yml
7. Confirm you have linked your Vonage Number to the AI Studio VCR Application. You can do this in the Vonage Dashboard.
8. Paste both your VCR App ID into the vcr.yml file.
9. Update your `AI_AGENT_REGION` within the `vcr.yml` that applies to your AI Studio Agent Region.

> The endpoint depends on the region you selected for your agent
> For EU agents --> https://studio-api-eu.ai.vonage.com/messaging/conversation
> For US agents --> https://studio-api-us.ai.vonage.com/messaging/conversation
> This demo uses [AI Studio Triggering an outbound WhatsApp virtual agent](https://studio.docs.ai.vonage.com/whatsapp/get-started/triggering-an-outbound-whatsapp-virtual-agent).
> Gather AI Studio Key and Agent ID and apply
> You can find the X-Vgai-Key on the top right of your canvas. Click on the "user" icon, and then "Generate API Key".

To apply:

- Run `vcr secret add --name AI_X_VGAI_KEY --value "YOUR_AI_X_VGAI_KEY"`
- Run `vcr secret add --name AI_AGENT_ID --value "YOUR_AI_AGENT_ID"`
- Run `export AI_X_VGAI_KEY="YOUR_AI_X_VGAI_KEY"`
- Run `export AI_AGENT_ID="YOUR_AI_AGENT_ID"`

## VCR Debug vs VCR Deploy

`vcr debug` vs `vcr deploy` both produce different Server URLs. Debug allows us to view logs in the terminal until terminal is killed, but Deploy is a permananent live URL.

To run in Debug mode run `vcr debug`. Copy URL and use it your POST request.

## Running the Demo

### Create the Queue (queue_name) POST Request

POST `VCR_URL/queues/create`

AUTH: For all requests, set Basic Auth. Username is apiKey and Password is its secret.

Body:

```js
{
    "name": "testqueue01",
    "maxInflight": 30,
    "msgPerSecond": 1
}
```

Response:

```js
{
    "success": true,
    "name": "testqueue01",
    "maxInflight": 30,
    "msgPerSecond": 1
}
```

### Just FYI, you can Delete the queue (queue_name) if you want to.

DELETE `VCR_URL/queues/:queue_name`

Usage: delete a queue and all it's contents immediately.

AUTH: For all requests, set Basic Auth. Username is apiKey and Password is its secret.

Payload: none

Response:

```js
{
    "success": true
}
```

### Add a WhatsApp Message to VCR Queue

POST `VCR_URL/queues/additem/:queue_name`

AUTH: For all requests, set Basic Auth. Username is apiKey and Password is its secret.

Params: queue_name = YOUR_QUEUE_NAME_YOU_CREATED

Example WhatsApp Body

```js
{
    "components": [
        {
            "type": "header",
            "parameters": [
                {
                    "type": "text",
                    "text": "PARAM1_VALUE"
                }
            ]
        },
        {
            "type": "body",
            "parameters": [
                {
                    "type": "text",
                    "text": "PARAM2_VALUE"
                }
            ]
        }
    ],
    "namespace": "NAMESPACE_ID",
    "template": "TEMPLATE_NAME",
    "locale": "en",
    "to": "TO_NUMBER",
    "agent_id": "AGENT_ID",
    "channel": "whatsapp",
    "status_url": "string",
    "session_parameters": [
    {
      "name": "string",
      "value": "string"
    }
  ]
}
```

## Credits

Thank to Toni Kusham for sharing VCR Queue sample code [See Here](https://github.com/klapperkopp/vcr-simple-queue-demo/tree/add-optional-filters-and-checks)

## POST /queues/create

Usage: Create a new queue into which you can add items to be processed.

For all requests, set Basic Auth. Username is apiKey and Password is its secret.

Payload:

```
{
    "name": "testqueue01",
    "maxInflight": 1, // Only one task inflight at a time
    "msgPerSecond": 1 // Dequeue one task per second
}
```

Response:

```
{
    "success": true,
    "name": "testqueue01",
    "maxInflight": 1,
    "msgPerSecond": 1
}
```

## POST /queues/additem/:queue_name

Usage: Add a request to be processed to a queue that you created. This demo usese Messages API requests.

Payload:

```js
{
    "components": [
        {
            "type": "header",
            "parameters": [
                {
                    "type": "text",
                    "text": "PARAM1_VALUE"
                }
            ]
        },
        {
            "type": "body",
            "parameters": [
                {
                    "type": "text",
                    "text": "PARAM2_VALUE"
                }
            ]
        }
    ],
    "namespace": "NAMESPACE_ID",
    "template": "TEMPLATE_NAME",
    "locale": "en",
    "to": "TO_NUMBER",
    "agent_id": "AGENT_ID",
    "channel": "whatsapp",
    "status_url": "string",
    "session_parameters": [
    {
      "name": "string",
      "value": "string"
    }
  ]
}
```

Response:

```js
{
    "success": true
}
```
