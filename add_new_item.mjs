import fs from 'node:fs/promises';
const entries_dir = './site/entries';
const site_dir = './site';
const template_file = "template.html";
let articles_per_page = 1000;

const template = `
<li class="article">
    <h1><a href="{{link}}">{{title}}</a></h1>
    <div class="date">{{date}}</div>
    <div class="description">{{description}}</div>
</li>
`;

async function openTemplate() {
    try {
        return fs.readFile(template_file, { encoding: "utf8" });
    } catch(ex) {
        throw "Template not found at " + template_file;
    }
}
const created_date_regex = /\<meta name="DC.created" content="(.*)"\>/;
async function get_created_data(file, content) {
    let date = get_date(content, created_date_regex);
    if (date) {
        return date;
    }
    let stat = await fs.stat(file);
    return stat.birthtimeMs;
}
const modified_date_regex = /\<meta name="DC.modified" content="(.*)"\>/;
async function get_modified_date(file, content) {
    let date = get_date(content, modified_date_regex);
    if (date) {
        return date;
    }
    let stat = await fs.stat(file);
    return stat.mtimeMs;
}

async function get_date(content, regex) {
    let date = content.match(regex);
    if (date) {
        try {
            let d = new Date(date[1]);
            return d;
        } catch(ex) { 
        }
    }
    return null;    
}

async function find_latest() {
    try {
        let file = site_dir + "/index.html";
        let data = await fs.readFile(file, { encoding: "utf8" });
        let count = (data.match(/\<article\>/g) || []).length;
        if (count === 10) {
            return get_modified_date(file, data);
        } else {
            return get_created_data(file, data);
        }
    } catch(ex) {
        return null;
    }
}

const titleRegex = /\<title\>(.*)\<\/title\>/;
const headingRegex = /^# (.*)/;
function getTitle(file, stat, file_content) {
    let m = file_content.match(titleRegex);
    if (!m) m = file_content.match(headingRegex);
    if (m) {
        return m[1];
    }
    return file;
}

const descriptionRegex = /\<meta name="description" content="(.*)"\>/;
function getDescription(file, stat, file_content) {
    let m = file_content.match(descriptionRegex);
    if (m) {
        return m[1];
    }

    m = file_content.match(headingRegex);
    if (m) {
        m = file_content.substring(m[0].length, 250).trim();
    }
    return m || "";
}

async function get_new(last_date) {
    let files = await fs.readdir(entries_dir);
    let file_contents = [];

    for (var i = 0; i < files.length; i++) {
        let file = entries_dir + "/" + files[i]
        let stat = await fs.stat(file);
        if (stat.birthtimeMs > last_date) {
            let file_content = await fs.readFile(file, { encoding: "utf8" });
            file_contents.push({
                title: getTitle(file, stat, file_content),
                link: "./entries/" + files[i],
                birth_date: stat.birthtimeMs,
                description: getDescription(file, stat, file_content)
            });
        }
    }
    return file_contents;
}

async function create_new(page, template_doc, file_contents) {
    const content = template_doc.replace("{{list-content}}", file_contents.map((f) => {
            return template.replace(/{{title}}/g, f.title)
                        .replace(/{{date}}/g, new Date(f.birth_date).toDateString())
                        .replace(/{{link}}/g, f.link)
                        .replace(/{{description}}/g, f.description);
        }).reverse().join("\n"))
        .replace("{{created}}", new Date(file_contents[0].birth_date).toISOString())
        .replace("{{modified}}", new Date(file_contents[file_contents.length - 1].birth_date).toISOString())
        .replace("{{navigation}}", "");

    return fs.writeFile(page, content);
}

async function run() {
    const template = await openTemplate();
    let latest = await find_latest();
    latest = latest || 0;
    let files = await get_new(latest);
    files = files.sort((a, b) => {
        return a.birth_date - b.birth_date;
    });
    let numberPagesToAdd = Math.ceil(files.length / articles_per_page);
    for (var i = 0; i < numberPagesToAdd; i++) {
        let sub_files = files.splice(0, articles_per_page);
        let file_name = i === numberPagesToAdd - 1 ? "index" : sub_files[0].birth_date;
        await create_new(site_dir + "/" + file_name + ".html", template, sub_files);
    }
}

run();