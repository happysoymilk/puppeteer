const functions = require("@google-cloud/functions-framework");

const puppeteer = require("puppeteer");

const wait = (ms) => {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
};

/**
 * @param {puppeteer.Browser} browser
 * @param {string} product_to_search
 * @returns
 */
const googlescrape = async (browser, product_to_search, today) => {
	const page = await browser.newPage();
	// try {
	// 	await page.waitForNavigation();
	// } catch (err) {
	// 	console.info(err);
	// }

	console.info("[INFO]: Created new page");

	await Promise.all([
		page.waitForNavigation(),
		page.goto(
			`https://www.google.com/search?tbm=shop&hl=en-US&psb=1&ved=2ahUKEwiUjd2ngZuAAxX_iX8EHWQ2CqUQu-kFegQIABAR&q=${product_to_search}&oq=${product_to_search}&gs_lcp=Cgtwcm9kdWN0cy1jYxADUABYAGAAaABwAHgAgAEAiAEAkgEAmAEA&sclient=products-cc`
		),
	]);
	// const html = await page.content();
	// console.log(html);

	console.info(`[INFO]: Loaded search page for ${product_to_search}`);

	// try {
	// 	await Promise.all([
	// 		page.waitForNavigation(),
	// 		page.click(
	// 			"button[class='VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-k8QpJ VfPpkd-LgbsSe-OWXEXe-dgl2Hf nCP5yc AjY5Oe DuMIQc LQeN7 Nc7WLe']"
	// 		),
	// 	]);

	// 	console.info(`[INFO]: Successfully accepted bloody cookies`);
	// } catch (err) {
	// 	// do nothng
	// 	console.info("Failed to accept cookies, probably already accepted...");
	// }

	const data = await page.evaluate(
		(product_to_search, today) => {
			console.info(`[INFO]: Evaluating ${product_to_search}...`);
			const sponsor = Array.from(
				document.querySelectorAll("div[class='KZmu8e']")
			);
			const organic = Array.from(
				document.querySelectorAll("div[class='sh-dgr__content']")
			);
			const sponsor_products = sponsor.map((product) => ({
				productsearched: product_to_search,
				productname:
					product.querySelector(
						"h3[class='sh-np__product-title translate-content']"
					)?.textContent || "Not provided",
				productprice:
					product
						.querySelector("b[class='translate-content']")
						?.textContent.replace(/[^\d\.]*/g, "") || "Not provided",
				company:
					product.querySelector("div[class='sh-np__seller-container']")
						?.textContent || "Not provided",
				date: today,
			}));
			const organic_products = organic.map((product) => ({
				productsearched: product_to_search,
				productname:
					product.querySelector("h3[class='tAxDx']")?.textContent ||
					"Not provided",
				productprice:
					product
						.querySelector("span[class='a8Pemb OFFNJ']")
						?.textContent.replace(/[^\d\.]*/g, "") || "Not provided",
				company:
					product.querySelector("div[class='aULzUe IuHnof']")?.textContent ||
					"Not provided",
				productshipment:
					product.querySelector("div[class='vEjMR']")?.textContent ||
					"Not provided",
				date: today,
			}));
			// console.log(sponsor_products);
			// console.log(organic_products);
			return { sponsor: sponsor_products, organic: organic_products };
		},
		product_to_search,
		today
	);
	console.info(`[INFO]: Successfully scraped ${product_to_search}`);

	return data;
};

const withRetries = async (scrapingFn, retries) => {
	let failures = 0;
	let errors = [];
	while (failures < retries - 1) {
		try {
			const data = await scrapingFn();
			return data;
		} catch (err) {
			failures += 1;
			errors.push(err);
		}
	}

	throw new Error("Failed to scrape 10 times... aborting. Errors::" + errors);
};

const main = async (
	keywords,
	datasetId = "testds",
	tableId_sponsor = "testUSSponsorTable",
	tableId_organic = "testUSOrganicTable"
) => {
	const d = new Date();
	const today = d.toLocaleDateString();
	// [START bigquery_table_insert_rows]
	// Import the Google Cloud client library
	const { BigQuery } = require("@google-cloud/bigquery");
	const bigquery = new BigQuery();

	async function scrape() {
		const browser = await puppeteer.launch({ headless: "new" });
		const rows_sponsor = [];
		const rows_organic = [];
		for (word of keywords) {
			const data = await googlescrape(browser, word, today);
			const sponsor = data.sponsor;
			const organic = data.organic;
			// while (sponsor.length === 0 || organic.length === 0) {
			// 	data = await googlescrape(browser, word, today);
			// 	sponsor = data.sponsor;
			// 	organic = data.organic;
			// }
			// if (sponsor === []) {
			// 	sponsor = {
			// 		productsearched: product_to_search,
			// 		productname:
			// 			"Not available",
			// 		productprice:"Not available",
			// 		company: "Not available",
			// 		date: today,
			// 	};
			// }
			// console.log(sponsor);
			// console.log(typeof sponsor);
			// console.log(organic);
			// console.log(typeof organic);
			if (sponsor.length !== 0) {
				rows_sponsor.push({
					data: sponsor,
					datasetId: datasetId,
					tableId: tableId_sponsor,
				});
			}
			if (organic.length !== 0) {
				rows_organic.push({
					data: organic,
					datasetId: datasetId,
					tableId: tableId_organic,
				});
			}
			// rows_sponsor.push({
			// 	data: sponsor,
			// 	datasetId: datasetId,
			// 	tableId: tableId_sponsor,
			// });
			// rows_organic.push({
			// 	data: organic,
			// 	datasetId: datasetId,
			// 	tableId: tableId_organic,
			// });
		}
		await browser.close();
		return { sponsor: rows_sponsor, organic: rows_organic };
	}

	async function insertRowsAsStream(rows) {
		let count = 0;
		// Inserts the JSON objects into my_dataset:my_table.
		for (let row of rows) {
			// Insert data into a table
			console.log(row.data);
			await bigquery.dataset(row.datasetId).table(row.tableId).insert(row.data);
			count += row.data.length;
			console.log(`Inserted ${row.data.length} rows`);
		}
		return count;
	}
	// [END bigquery_table_insert_rows]

	const data = await withRetries(scrape, 10);
	const sponsorRow = data.sponsor;
	const organicRow = data.organic;
	const count = await insertRowsAsStream(sponsorRow);
	const count_organic = await insertRowsAsStream(organicRow);
	// await insertRowsAsStream(organicrow);

	return { sposnor: count, organic: count_organic };
	// return count_organic;
};

// Promise.resolve(main(["photo blanket", "photo canvas"]));

// functions.http("helloHttp", async (req, res) => {
// 	try {
// 		const keywords = req.body.keywords ?? [
// 			"photo blanket",
// 			"photo canvas",
// 			"photo book",
// 			"photo calendar",
// 			"personalised blanket",
// 			"photobook",
// 			"wedding photo book",
// 			"wedding book",
// 			"photo slate",
// 			"photo collage",
// 			"metal prints",
// 			"photo mug",
// 			"photo tiles",
// 			"greeting card",
// 			"photo puzzle",
// 		];
// 		// const keyword = ['photo blanket','canvas','photo book','photo calendar','personalised blanket','photobook','wedding photo book','wedding book','photo slate','photo collage','metal prints','photo mug',
// 		// 'photo tiles','greeting card','photo puzzle'];
// 		const count = await main(keywords);
// 		res.send(
// 			`Success! Uploaded ${count.sposnor} sposnor rows and ${count.organic} organic rows!`
// 		);
// 	} catch (err) {
// 		res.send("got an error: " + err);
// 	}
// });

// Register a CloudEvent callback with the Functions Framework that will
// be executed when the Pub/Sub trigger topic receives a message.
functions.cloudEvent("helloPubSub", async (cloudEvent) => {
	// The Pub/Sub message is passed as the CloudEvent's data payload.
	const base64name = cloudEvent.data.message.data;

	const name = base64name
		? Buffer.from(base64name, "base64").toString()
		: "NodeJS18 UK scraper";

	try {
		const keywords = [
			"photo blanket",
			"photo canvas",
			"photo book",
			"photo calendar",
			"personalised blanket",
			"photobook",
			"wedding photo book",
			"wedding book",
			"photo slate",
			"photo collage",
			"metal prints",
			"photo mug",
			"photo tiles",
			"greeting card",
			"photo puzzle",
		];

		// const keywords = ["photo blanket", "photo book"];
		const count = await main(keywords);
		console.log(
			`Success! Uploaded ${count.sposnor} sposnor rows and ${count.organic} organic rows!`
		);
	} catch (err) {
		console.log("got an error: " + err);
	}

	console.log(`Hello, ${name}!`);
});
