// This example uses Express to receive webhooks
require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const mongoUrl = process.env.MONGO_URL;
const MongoUtil = require("./MongoUtil");

app.use(express.json());
app.use(cors());

// Instantiating formsg-sdk without parameters default to using the package's
// production public signing key.
const formsg = require("@opengovsg/formsg-sdk")({ mode: "production" });

// This is where your domain is hosted, and should match
// the URI supplied to FormSG in the form dashboard
const POST_URI = process.env.POST_URI;

// Your form's secret key downloaded from FormSG upon form creation
const formSecretKey = process.env.FORM_SECRET_KEY;

// Set to true if you need to download and decrypt attachments from submissions
const HAS_ATTACHMENTS = false;

(async () => {
  const db = await MongoUtil.connect(mongoUrl, "formsg-evaltest");

  app.post(
    "/submit",
    // Endpoint authentication by verifying signatures
    function (req, res, next) {
      try {
        formsg.webhooks.authenticate(req.get("X-FormSG-Signature"), POST_URI);
        // Continue processing the POST body
        return next();
      } catch (e) {
        return res.status(401).send({ message: "Unauthorized" });
      }
    },

    // Parse JSON from raw request body
    express.json(),

    // Decrypt the submission
    async (req, res) => {
      // If `verifiedContent` is provided in `req.body.data`, the return object
      // will include a verified key.
      const submission = HAS_ATTACHMENTS
        ? await formsg.crypto.decryptWithAttachments(
            formSecretKey,
            req.body.data
          )
        : formsg.crypto.decrypt(formSecretKey, req.body.data);

      // If the decryption failed, submission will be `null`.
      if (submission) {
        const getAnswer = (id) => {
          const result = submission.responses.filter((i) => i._id === id);
          return result[0].answer;
        };

        const answerObj = {
          firstName: getAnswer("632949d73a132e0012c629fe"),
          lastName: getAnswer("632949de184d400012e3f9ff"),
          postalCode: getAnswer("632949eb79c05e001238386b"),
        };

        const { firstName, lastName, postalCode } = answerObj;

        try {
          const response = await db.collection("responses").insertOne({
            date: new Date(),
            firstName: firstName,
            lastName: lastName,
            postalCode: postalCode,
          });
          res.status(200);
          res.send("Form submitted to database successfully");
          console.log("Form submitted to database successfully");
        } catch (error) {
          console.log(error);
          res.status(500);
          res.send("Failed to submit form to database");
          console.log("Failed to submit form to database");
        }
      } else {
        // Could not decrypt the submission
        // To account for fail route
      }
    }
  );

  app.get("/responses", async (req, res) => {
    const response = await db.collection("responses").find({}).toArray();
    res.send(response);
    res.status(200);
  });

  app.get("/", async (req, res) => {
    res.send("Hello world");
    res.status(200);
  });
})();

app.listen(process.env.PORT || 7000, () =>
  console.log("Server is running! Woohoo!")
);
