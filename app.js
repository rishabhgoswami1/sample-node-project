require("dotenv").config();
var http = require("http");
var express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const formidable = require("formidable");
const fs = require("fs");
const { MedplumClient } = require("@medplum/core");

var cors = require("cors");
var app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const medplum = new MedplumClient({
	baseUrl: "https://fhir.ovok.com/",
});

app.get("/download/:documentId", async (req, res) => {
	const documentId = req.params.documentId;
	const headers = {
		"Content-Type": "application/json",
		Authorization: "api_3yraefhs89eq59mq",
	};

	try {
		const url = `https://app.documenso.com/api/v1/documents/${documentId}/download`;
		const response = await axios.get(url, { headers });

		return res.status(response.status).json(response.data);

		// if (response.data && response.data.downloadUrl) {
		// 	const downloadUrl = response.data.downloadUrl;
		// 	const fileResponse = await axios.get(downloadUrl, { responseType: 'stream' });

		// 	res.setHeader('Content-Disposition', `attachment; filename=${documentId}.pdf`);
		// 	fileResponse.data.pipe(res);
		// } else {
		// 	throw new Error("Download URL not found in response");
		// }
	} catch (error) {
		console.error("Error occurred:", error);
		res.status(500).send("Error occurred: " + error.message);
	}
});

app.post("/upload", (req, res) => {
	const form = new formidable.IncomingForm();

	form.parse(req, async (err, fields, files) => {
		if (err) {
			res.status(500).send("Error occurred: " + err.message);
			return;
		}

		try {
			console.log("start");
			const file = files.file[0];
			const { title, externalId, recipient, numberOfPages } = fields;
			const recipientObj = JSON.parse(recipient[0]);

			console.log("File received:", file.filepath);
			console.log("Title:", title[0]);
			console.log("External ID:", externalId[0]);
			console.log("Recipient:", recipientObj);

			await uploadAndSendFile(
				file,
				title[0],
				externalId[0],
				numberOfPages[0],
				recipientObj
			);
			res.status(200).send("File uploaded and sent successfully.");
		} catch (error) {
			res.status(500).send("Error occurred: " + error.message);
		}
	});
});

async function uploadAndSendFile(
	file,
	title,
	externalId,
	numberOfPages,
	recipient
) {
	const headers = {
		"Content-Type": "application/json",
		Authorization: "api_3yraefhs89eq59mq",
	};

	try {
		const url = "https://app.documenso.com/api/v1/documents";
		const payload = {
			title: title,
			externalId: externalId,
			recipients: [recipient],
			formValues: {
				additionalProp1: "value1",
				additionalProp2: "value2",
				additionalProp3: "value3",
			},
		};

		const response = await axios.post(url, payload, { headers });
		const uploadUrl = response.data.uploadUrl;
		const documentId = response.data.documentId;
		const recipientId = response.data.recipients[0].recipientId;

		console.log("Document created, upload URL:", uploadUrl);

		const formData = new FormData();
		formData.append("", fs.createReadStream(file.filepath));
		console.log("File appended to form data", formData);

		const putResponse = await axios.put(uploadUrl, formData, {
			headers: {
				"Content-Type": "multipart/form-data",
			},
		});

		console.log("File uploaded successfully:", putResponse.status);

		// Now add signature fields

		const signatureFieldsUrl = `https://app.documenso.com/api/v1/documents/${documentId}/fields`;
		const signatureFieldPayload = {
			recipientId: recipientId,
			type: "SIGNATURE",
			pageNumber: Number(numberOfPages),
			pageX: 30,
			pageY: 85,
			pageWidth: 20,
			pageHeight: 7,
		};

		const signatureFieldResponse = await axios.post(
			signatureFieldsUrl,
			signatureFieldPayload,
			{ headers }
		);
		console.log(
			"Signature field added successfully:",
			signatureFieldResponse.status
		);

		const sendUrl = `https://app.documenso.com/api/v1/documents/${documentId}/send`;

		const sendResponse = await axios.post(
			sendUrl,
			{
				sendEmail: true,
			},
			{ headers }
		);
		console.log("Document sent successfully:", sendResponse.status);
	} catch (error) {
		console.error("Error occurred:", error);
		throw error;
	}
}

app.post("/webhook", async (req, res) => {
	try {
		const requestBody = req.body;
		if (requestBody.event === "DOCUMENT_SIGNED") {
			await medplum.startClientLogin(
				"2611e082-c449-4ee7-92cd-8974cab9a8c8",
				"62ddc118b45ea649adee100b0e7075846b61d5b2122aa71c41b0ad8f5bad8e82"
			);

			const payload = requestBody.payload;
			const documentId = payload.id;

			const consentId = payload.externalId.split("/")[1];
			console.log("consent ID",consentId)
			const consentReturned = await medplum.readResource("Consent", consentId);
			const updatedConsent = {
				...consentReturned,
				resourceType: "Consent",
				status: "active",
				identifier: [
					{
						system: "https://app.documenso.com",
						value: documentId.toString(),
					},
				],
			};

			await medplum.updateResource(updatedConsent);
			return res.status(200).send("Consent updated successfully.");
		}

		res.status(200).send("Webhook received successfully.");
	} catch (error) {
		console.error("Error processing webhook:", error);
		res.status(500).send("Error processing webhook: " + error.message);
	}
});

app.set("port", process.env.PORT || 3005);
app.set("views", __dirname + "/app/server/views");
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/app/public"));

require("./app/routes")(app);

http.createServer(app).listen(app.get("port"), function () {
	console.log("System " + app.get("port") + " working.");
});
