var http = require("http");
var express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const formidable = require("formidable");
const fs = require("fs");

var app = express();

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
			const { title, externalId, recipient } = fields;
			const recipientObj = JSON.parse(recipient[0]);

			console.log("File received:", file.filepath);
			console.log("Title:", title[0]);
			console.log("External ID:", externalId[0]);
			console.log("Recipient:", recipientObj);

			await uploadAndSendFile(file, title[0], externalId[0], recipientObj);
			res.status(200).send("File uploaded and sent successfully.");
		} catch (error) {
			res.status(500).send("Error occurred: " + error.message);
		}
	});
});

async function uploadAndSendFile(file, title, externalId, recipient) {
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

app.set("port", process.env.PORT || 3005);
app.set("views", __dirname + "/app/server/views");
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/app/public"));

require("./app/routes")(app);

http.createServer(app).listen(app.get("port"), function () {
	console.log("System " + app.get("port") + " working.");
});
