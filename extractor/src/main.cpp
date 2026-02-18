#include <mupdf/pdf.h>
#include <zip.h>
#include <pugixml.hpp>
#include <iostream>
#include <fstream>
#include <filesystem>
#include <string>
#include <sstream>
#include <vector>
#include <algorithm>
#include <set>
#include <map>
#include <unordered_map>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <gumbo.h>
#include <zim/archive.h>
#include <zim/entry.h>
#include <zim/item.h>
#include <librsvg/rsvg.h>
#include <cairo/cairo.h>

#define STB_IMAGE_IMPLEMENTATION
#include "stb/stb_image.h"
#define STB_IMAGE_RESIZE_IMPLEMENTATION
#include "stb/stb_image_resize2.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb/stb_image_write.h"

namespace fs = std::filesystem;

// Maximum decompressed file size from ZIP archives (100 MB)
static constexpr size_t MAX_ZIP_ENTRY_SIZE = 100 * 1024 * 1024;

// Forward declarations for thumbnail generation (defined after ZIM helpers)
static int generate_thumbnails(const unsigned char *data, int data_len,
                               const std::string &out_dir, const std::string &prefix);
static int generate_thumbnails_from_file(const std::string &image_path,
                                         const std::string &out_dir,
                                         const std::string &prefix);

// Sanitize a filename by stripping path components to prevent path traversal
std::string sanitize_filename(const std::string &raw_name) {
    std::string safe_name = fs::path(raw_name).filename().string();
    if (safe_name.empty() || safe_name == "." || safe_name == "..") {
        return "";
    }
    return safe_name;
}

// Extract text from a PDF document
std::string pdf_extract_text(fz_context *ctx, fz_document *pdf_doc) {
    std::string extracted_text;
    int page_count = fz_count_pages(ctx, pdf_doc);
    
    for (int page_idx = 0; page_idx < page_count; page_idx++) {
        fz_page *page = NULL;
        fz_stext_page *stext_page = NULL;
        fz_buffer *text_buffer = NULL;
        
        fz_var(page);
        fz_var(stext_page);
        fz_var(text_buffer);
        
        fz_try(ctx) {
            page = fz_load_page(ctx, pdf_doc, page_idx);
            stext_page = fz_new_stext_page_from_page(ctx, page, NULL);
            text_buffer = fz_new_buffer_from_stext_page(ctx, stext_page);
            
            unsigned char *buffer_data = NULL;
            size_t buffer_len = fz_buffer_storage(ctx, text_buffer, &buffer_data);
            
            extracted_text += "--- Page " + std::to_string(page_idx + 1) + " ---\n";
            extracted_text += std::string((char*)buffer_data, buffer_len);
            extracted_text += "\n";
        }
        fz_always(ctx) {
            fz_drop_buffer(ctx, text_buffer);
            fz_drop_stext_page(ctx, stext_page);
            fz_drop_page(ctx, page);
        }
        fz_catch(ctx) {
            std::cerr << "  Warning: failed to extract text from page " << (page_idx + 1) << ": " << fz_caught_message(ctx) << std::endl;
        }
    }
    
    return extracted_text;
}

// Extract images from a PDF document (deduplicates shared XObjects by object number)
int pdf_extract_images(fz_context *ctx, fz_document *doc, const std::string &base_name, const std::string &output_dir) {
    int image_count = 0;
    int page_count = fz_count_pages(ctx, doc);
    std::set<int> seen_objnums;
    
    pdf_document *pdf_doc = pdf_document_from_fz_document(ctx, doc);
    if (!pdf_doc) return 0;
    
    for (int page_idx = 0; page_idx < page_count; page_idx++) {
        fz_page *fitz_page = fz_load_page(ctx, doc, page_idx);
        pdf_page *page = pdf_page_from_fz_page(ctx, fitz_page);
        
        if (!page) {
            fz_drop_page(ctx, fitz_page);
            continue;
        }
        
        pdf_obj *resources = pdf_page_resources(ctx, page);
        pdf_obj *xobjects = pdf_dict_get(ctx, resources, PDF_NAME(XObject));
        
        if (xobjects) {
            int xobject_count = pdf_dict_len(ctx, xobjects);
            
            for (int obj_idx = 0; obj_idx < xobject_count; obj_idx++) {
                pdf_obj *image_ref = pdf_dict_get_val(ctx, xobjects, obj_idx);
                
                if (pdf_dict_get(ctx, image_ref, PDF_NAME(Subtype)) == PDF_NAME(Image)) {
                    // Skip duplicate images shared across pages
                    int objnum = pdf_to_num(ctx, image_ref);
                    if (seen_objnums.count(objnum)) {
                        continue;
                    }
                    seen_objnums.insert(objnum);
                    
                    fz_image *image = NULL;
                    fz_pixmap *pixmap = NULL;
                    fz_pixmap *rgb_pixmap = NULL;
                    
                    fz_var(image);
                    fz_var(pixmap);
                    fz_var(rgb_pixmap);
                    
                    fz_try(ctx) {
                        image = pdf_load_image(ctx, pdf_doc, image_ref);
                        pixmap = fz_get_pixmap_from_image(ctx, image, NULL, NULL, NULL, NULL);
                        
                        // Convert CMYK/other colorspaces to sRGB for PNG output
                        fz_colorspace *colorspace = fz_pixmap_colorspace(ctx, pixmap);
                        if (colorspace && colorspace != fz_device_rgb(ctx) && colorspace != fz_device_gray(ctx)) {
                            rgb_pixmap = fz_convert_pixmap(ctx, pixmap, fz_device_rgb(ctx), NULL, NULL, fz_default_color_params, 1);
                            fz_drop_pixmap(ctx, pixmap);
                            pixmap = rgb_pixmap;
                            rgb_pixmap = NULL;
                        }
                        
                        std::string image_path = output_dir + "/" + base_name +
                                                 "_img" + std::to_string(image_count) + ".png";
                        
                        fz_save_pixmap_as_png(ctx, pixmap, image_path.c_str());
                        image_count++;
                    }
                    fz_always(ctx) {
                        fz_drop_pixmap(ctx, rgb_pixmap);
                        fz_drop_pixmap(ctx, pixmap);
                        fz_drop_image(ctx, image);
                    }
                    fz_catch(ctx) {
                        std::cerr << "  Warning: failed to extract image " << obj_idx << " from page " << (page_idx + 1) << ": " << fz_caught_message(ctx) << std::endl;
                    }
                }
            }
        }
        
        fz_drop_page(ctx, fitz_page);
    }
    
    return image_count;
}

// Read a file from inside a ZIP archive into a string (with size validation)
std::string zip_read_file(zip_t *archive, const std::string &entry_name) {
    zip_stat_t entry_stat;
    zip_stat_init(&entry_stat);
    if (zip_stat(archive, entry_name.c_str(), 0, &entry_stat) != 0) {
        return "";
    }
    
    if (!(entry_stat.valid & ZIP_STAT_SIZE) || entry_stat.size > MAX_ZIP_ENTRY_SIZE) {
        return "";
    }
    
    zip_file_t *zip_handle = zip_fopen(archive, entry_name.c_str(), 0);
    if (!zip_handle) {
        return "";
    }
    
    std::string contents(entry_stat.size, '\0');
    zip_int64_t bytes_read = zip_fread(zip_handle, &contents[0], entry_stat.size);
    zip_fclose(zip_handle);
    
    if (bytes_read < 0 || (zip_uint64_t)bytes_read != entry_stat.size) {
        return "";
    }
    
    return contents;
}

// Extract media files from a ZIP archive under a given prefix directory
int zip_extract_media(const std::string &archive_path, const std::string &media_prefix,
                      const std::string &base_name, const std::string &output_dir) {
    int media_count = 0;
    int zip_error = 0;
    zip_t *archive = zip_open(archive_path.c_str(), ZIP_RDONLY, &zip_error);
    if (!archive) return 0;
    
    zip_int64_t total_entries = zip_get_num_entries(archive, 0);
    
    for (zip_int64_t entry_idx = 0; entry_idx < total_entries; entry_idx++) {
        const char *raw_entry_name = zip_get_name(archive, entry_idx, 0);
        if (!raw_entry_name) continue;
        
        std::string entry_path(raw_entry_name);
        if (entry_path.rfind(media_prefix, 0) != 0) continue;
        
        // Sanitize to prevent path traversal attacks
        std::string safe_filename = sanitize_filename(entry_path);
        if (safe_filename.empty()) continue;
        
        zip_stat_t entry_stat;
        zip_stat_init(&entry_stat);
        if (zip_stat_index(archive, entry_idx, 0, &entry_stat) != 0) continue;
        if (!(entry_stat.valid & ZIP_STAT_SIZE) || entry_stat.size == 0 || entry_stat.size > MAX_ZIP_ENTRY_SIZE) continue;
        
        zip_file_t *zip_handle = zip_fopen_index(archive, entry_idx, 0);
        if (!zip_handle) continue;
        
        std::vector<char> file_data(entry_stat.size);
        zip_int64_t bytes_read = zip_fread(zip_handle, file_data.data(), entry_stat.size);
        zip_fclose(zip_handle);
        
        if (bytes_read < 0 || (zip_uint64_t)bytes_read != entry_stat.size) continue;
        
        std::string output_path = output_dir + "/" + base_name + "_" + safe_filename;
        std::ofstream output_file(output_path, std::ios::binary);
        if (output_file.is_open()) {
            output_file.write(file_data.data(), file_data.size());
            output_file.close();
            media_count++;
        }
    }
    
    zip_close(archive);
    return media_count;
}

// Recursively walk DOCX XML nodes to extract text from <w:t> elements
void walk_docx_xml(pugi::xml_node node, std::ostringstream &text_stream) {
    for (pugi::xml_node child : node.children()) {
        std::string node_name = child.name();
        
        if (node_name == "w:p") {
            walk_docx_xml(child, text_stream);
            text_stream << "\n";
            continue;
        }
        
        if (node_name == "w:tab") {
            text_stream << "\t";
            continue;
        }
        
        if (node_name == "w:t") {
            text_stream << child.child_value();
            continue;
        }
        
        walk_docx_xml(child, text_stream);
    }
}

// Extract text from a DOCX file
std::string docx_extract_text(const std::string &docx_path) {
    int zip_error = 0;
    zip_t *archive = zip_open(docx_path.c_str(), ZIP_RDONLY, &zip_error);
    if (!archive) {
        std::cerr << "  Failed to open DOCX as ZIP" << std::endl;
        return "";
    }
    
    std::string document_xml = zip_read_file(archive, "word/document.xml");
    zip_close(archive);
    
    if (document_xml.empty()) {
        std::cerr << "  No word/document.xml found in DOCX" << std::endl;
        return "";
    }
    
    pugi::xml_document xml_doc;
    pugi::xml_parse_result parse_result = xml_doc.load_string(document_xml.c_str());
    if (!parse_result) {
        std::cerr << "  Failed to parse document.xml: " << parse_result.description() << std::endl;
        return "";
    }
    
    std::ostringstream text_stream;
    walk_docx_xml(xml_doc.document_element(), text_stream);
    return text_stream.str();
}

// Extract images from a DOCX file
int docx_extract_images(const std::string &docx_path, const std::string &base_name, const std::string &output_dir) {
    return zip_extract_media(docx_path, "word/media/", base_name, output_dir);
}

// Extract text from a plain text file (.txt, .md)
std::string plaintext_extract(const std::string &file_path) {
    std::ifstream input_file(file_path);
    if (!input_file.is_open()) {
        std::cerr << "  Failed to open file" << std::endl;
        return "";
    }
    std::ostringstream content_stream;
    content_stream << input_file.rdbuf();
    return content_stream.str();
}

// Recursively extract text from a Gumbo parse tree node
void gumbo_extract_text_recursive(GumboNode *node, std::ostringstream &text_stream) {
    if (node->type == GUMBO_NODE_TEXT || node->type == GUMBO_NODE_WHITESPACE) {
        text_stream << node->v.text.text;
        return;
    }
    
    if (node->type != GUMBO_NODE_ELEMENT) {
        return;
    }
    
    // Skip script and style elements entirely
    GumboTag tag = node->v.element.tag;
    if (tag == GUMBO_TAG_SCRIPT || tag == GUMBO_TAG_STYLE) {
        return;
    }
    
    GumboVector *children = &node->v.element.children;
    for (unsigned int child_idx = 0; child_idx < children->length; child_idx++) {
        gumbo_extract_text_recursive(static_cast<GumboNode*>(children->data[child_idx]), text_stream);
    }
    
    // Emit whitespace after block-level elements
    switch (tag) {
        case GUMBO_TAG_P:
        case GUMBO_TAG_DIV:
        case GUMBO_TAG_H1:
        case GUMBO_TAG_H2:
        case GUMBO_TAG_H3:
        case GUMBO_TAG_H4:
        case GUMBO_TAG_H5:
        case GUMBO_TAG_H6:
        case GUMBO_TAG_TR:
        case GUMBO_TAG_LI:
        case GUMBO_TAG_BR:
        case GUMBO_TAG_BLOCKQUOTE:
        case GUMBO_TAG_ARTICLE:
        case GUMBO_TAG_SECTION:
        case GUMBO_TAG_HEADER:
        case GUMBO_TAG_FOOTER:
            text_stream << "\n";
            break;
        case GUMBO_TAG_TD:
        case GUMBO_TAG_TH:
            text_stream << "\t";
            break;
        default:
            break;
    }
}

// Strip HTML tags from a raw HTML string and return plain text (Gumbo-based)
std::string strip_html_tags(const std::string &html_content) {
    GumboOutput *gumbo_output = gumbo_parse(html_content.c_str());
    if (!gumbo_output) {
        return "";
    }
    
    std::ostringstream text_stream;
    gumbo_extract_text_recursive(gumbo_output->root, text_stream);
    gumbo_destroy_output(&kGumboDefaultOptions, gumbo_output);
    
    return text_stream.str();
}

// Strip HTML tags and extract text content from an HTML file
std::string html_extract_text(const std::string &file_path) {
    std::ifstream input_file(file_path);
    if (!input_file.is_open()) {
        std::cerr << "  Failed to open HTML file" << std::endl;
        return "";
    }
    std::ostringstream raw_stream;
    raw_stream << input_file.rdbuf();
    
    return strip_html_tags(raw_stream.str());
}

// Extract text from an XLSX file
std::string xlsx_extract_text(const std::string &xlsx_path) {
    int zip_error = 0;
    zip_t *archive = zip_open(xlsx_path.c_str(), ZIP_RDONLY, &zip_error);
    if (!archive) {
        std::cerr << "  Failed to open XLSX as ZIP" << std::endl;
        return "";
    }
    
    // Load shared strings table
    std::vector<std::string> shared_strings;
    std::string shared_strings_xml = zip_read_file(archive, "xl/sharedStrings.xml");
    if (!shared_strings_xml.empty()) {
        pugi::xml_document strings_doc;
        if (strings_doc.load_string(shared_strings_xml.c_str())) {
            for (pugi::xml_node string_item : strings_doc.document_element().children("si")) {
                std::ostringstream cell_text;
                pugi::xml_node text_node = string_item.child("t");
                if (text_node) {
                    cell_text << text_node.child_value();
                } else {
                    // Handle rich text: <r><t>...</t></r>
                    for (pugi::xml_node rich_run : string_item.children("r")) {
                        pugi::xml_node rich_text = rich_run.child("t");
                        if (rich_text) cell_text << rich_text.child_value();
                    }
                }
                shared_strings.push_back(cell_text.str());
            }
        }
    }
    
    // Discover sheet paths via workbook.xml + relationships
    struct SheetInfo { std::string name; std::string zip_path; };
    std::vector<SheetInfo> sheet_list;
    
    std::string workbook_xml = zip_read_file(archive, "xl/workbook.xml");
    std::string rels_xml = zip_read_file(archive, "xl/_rels/workbook.xml.rels");
    
    if (!workbook_xml.empty() && !rels_xml.empty()) {
        // Parse relationships: map rId -> target path
        std::map<std::string, std::string> rel_map;
        pugi::xml_document rels_doc;
        if (rels_doc.load_string(rels_xml.c_str())) {
            for (pugi::xml_node rel_node : rels_doc.document_element().children("Relationship")) {
                std::string rel_id = rel_node.attribute("Id").as_string();
                std::string rel_target = rel_node.attribute("Target").as_string();
                if (!rel_id.empty() && !rel_target.empty()) {
                    rel_map[rel_id] = rel_target;
                }
            }
        }
        
        // Parse workbook.xml for sheet names and rIds
        pugi::xml_document wb_doc;
        if (wb_doc.load_string(workbook_xml.c_str())) {
            pugi::xml_node sheets_node = wb_doc.document_element().child("sheets");
            for (pugi::xml_node sheet_node : sheets_node.children("sheet")) {
                std::string sheet_name = sheet_node.attribute("name").as_string();
                std::string rid = sheet_node.attribute("r:id").as_string();
                auto rel_it = rel_map.find(rid);
                if (rel_it != rel_map.end()) {
                    // Target is relative to xl/, e.g. "worksheets/sheet1.xml"
                    sheet_list.push_back({sheet_name, "xl/" + rel_it->second});
                }
            }
        }
    }
    
    // Fallback: sequential discovery if workbook.xml parsing failed
    if (sheet_list.empty()) {
        for (int fallback_idx = 1; ; fallback_idx++) {
            std::string fallback_path = "xl/worksheets/sheet" + std::to_string(fallback_idx) + ".xml";
            std::string probe = zip_read_file(archive, fallback_path);
            if (probe.empty()) break;
            sheet_list.push_back({"Sheet " + std::to_string(fallback_idx), fallback_path});
        }
    }
    
    // Process discovered sheets
    std::ostringstream output_stream;
    for (size_t sheet_idx = 0; sheet_idx < sheet_list.size(); sheet_idx++) {
        const SheetInfo &sheet_info = sheet_list[sheet_idx];
        std::string sheet_xml = zip_read_file(archive, sheet_info.zip_path);
        if (sheet_xml.empty()) continue;
        
        pugi::xml_document sheet_doc;
        if (!sheet_doc.load_string(sheet_xml.c_str())) {
            continue;
        }
        
        output_stream << "--- " << sheet_info.name << " ---\n";
        
        pugi::xml_node sheet_data = sheet_doc.document_element().child("sheetData");
        for (pugi::xml_node row_node : sheet_data.children("row")) {
            bool is_first_cell = true;
            for (pugi::xml_node cell_node : row_node.children("c")) {
                if (!is_first_cell) output_stream << "\t";
                is_first_cell = false;
                
                std::string cell_type = cell_node.attribute("t").as_string();
                pugi::xml_node value_node = cell_node.child("v");
                
                if (cell_type == "s" && value_node) {
                    // Shared string reference
                    try {
                        int string_idx = std::stoi(value_node.child_value());
                        if (string_idx >= 0 && string_idx < (int)shared_strings.size()) {
                            output_stream << shared_strings[string_idx];
                        }
                    } catch (const std::exception &) {
                        // Invalid shared string index, skip
                    }
                } else if (cell_type == "inlineStr") {
                    pugi::xml_node inline_string = cell_node.child("is");
                    if (inline_string) {
                        pugi::xml_node text_node = inline_string.child("t");
                        if (text_node) output_stream << text_node.child_value();
                    }
                } else if (value_node) {
                    output_stream << value_node.child_value();
                }
            }
            output_stream << "\n";
        }
        output_stream << "\n";
    }
    
    zip_close(archive);
    return output_stream.str();
}

// Extract images from an XLSX file (from xl/media/)
int xlsx_extract_images(const std::string &xlsx_path, const std::string &base_name, const std::string &output_dir) {
    return zip_extract_media(xlsx_path, "xl/media/", base_name, output_dir);
}

// Helper to write extracted text to an output file
bool write_text_file(const std::string &output_path, const std::string &content) {
    std::ofstream output_file(output_path);
    if (!output_file.is_open()) {
        std::cerr << "  Failed to write: " << output_path << std::endl;
        return false;
    }
    output_file << content;
    output_file.close();
    return true;
}

// --- CLI helpers ---

// Escape a string for safe JSON output
std::string json_escape(const std::string &s) {
    std::ostringstream o;
    for (char c : s) {
        switch (c) {
            case '"':  o << "\\\""; break;
            case '\\': o << "\\\\"; break;
            case '\b': o << "\\b"; break;
            case '\f': o << "\\f"; break;
            case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break;
            case '\t': o << "\\t"; break;
            default:
                if ('\x00' <= c && c <= '\x1f') {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", (int)(unsigned char)c);
                    o << buf;
                } else {
                    o << c;
                }
        }
    }
    return o.str();
}

// Normalize a file extension to lowercase (e.g. ".PDF" -> ".pdf")
std::string normalize_ext(const std::string &ext) {
    std::string norm;
    for (char ch : ext) norm += std::tolower(ch);
    return norm;
}

// Supported file extensions for extraction
static const std::set<std::string> SUPPORTED_EXTS = {
    ".pdf", ".docx", ".doc", ".xlsx", ".html", ".htm", ".txt", ".md"
};

bool is_supported(const std::string &norm_ext) {
    return SUPPORTED_EXTS.count(norm_ext) > 0;
}

// Collect new files created in a directory (diff after vs before)
std::vector<std::string> collect_new_files(
    const std::string &dir, const std::set<std::string> &before)
{
    std::vector<std::string> result;
    if (!fs::exists(dir)) return result;
    for (const auto &e : fs::directory_iterator(dir)) {
        if (before.find(e.path().string()) == before.end())
            result.push_back(e.path().string());
    }
    std::sort(result.begin(), result.end());
    return result;
}

// Snapshot all files in a directory
std::set<std::string> snapshot_dir(const std::string &dir) {
    std::set<std::string> s;
    if (fs::exists(dir)) {
        for (const auto &e : fs::directory_iterator(dir))
            s.insert(e.path().string());
    }
    return s;
}

// Process a single file: extract text and/or images, emit JSON to stdout
// Returns true on success
bool process_file(const std::string &file_path, bool want_text, bool want_images,
                  const std::string &image_out_dir, fz_context *ctx)
{
    if (!fs::exists(file_path)) {
        std::cout << "{\"success\":false,\"file\":\"" << json_escape(file_path)
                  << "\",\"error\":\"File not found\"}" << std::endl;
        return false;
    }

    std::string ext = normalize_ext(fs::path(file_path).extension().string());
    std::string base_name = fs::path(file_path).stem().string();

    if (!is_supported(ext)) {
        std::cout << "{\"success\":false,\"file\":\"" << json_escape(file_path)
                  << "\",\"error\":\"Unsupported file type: " << json_escape(ext) << "\"}" << std::endl;
        return false;
    }

    // Per-file image output subdirectory (avoids collisions in batch mode)
    std::string file_image_dir = image_out_dir;
    if (want_images && !image_out_dir.empty()) {
        fs::create_directories(file_image_dir);
    }

    auto before = want_images ? snapshot_dir(file_image_dir) : std::set<std::string>{};

    std::string extracted_text;
    std::string error_msg;

    // --- PDF ---
    if (ext == ".pdf") {
        if (!ctx) {
            std::cout << "{\"success\":false,\"file\":\"" << json_escape(file_path)
                      << "\",\"error\":\"MuPDF context not available\"}" << std::endl;
            return false;
        }

        fz_document *doc = NULL;
        fz_var(doc);
        fz_try(ctx) { doc = fz_open_document(ctx, file_path.c_str()); }
        fz_catch(ctx) {
            error_msg = fz_caught_message(ctx);
            std::cout << "{\"success\":false,\"file\":\"" << json_escape(file_path)
                      << "\",\"error\":\"" << json_escape(error_msg) << "\"}" << std::endl;
            return false;
        }

        if (want_text)   extracted_text = pdf_extract_text(ctx, doc);
        if (want_images && !file_image_dir.empty())
            pdf_extract_images(ctx, doc, base_name, file_image_dir);

        fz_drop_document(ctx, doc);
    }
    // --- DOCX / DOC ---
    else if (ext == ".docx" || ext == ".doc") {
        if (want_text)   extracted_text = docx_extract_text(file_path);
        if (want_images && !file_image_dir.empty())
            docx_extract_images(file_path, base_name, file_image_dir);
    }
    // --- XLSX ---
    else if (ext == ".xlsx") {
        if (want_text)   extracted_text = xlsx_extract_text(file_path);
        if (want_images && !file_image_dir.empty())
            xlsx_extract_images(file_path, base_name, file_image_dir);
    }
    // --- HTML ---
    else if (ext == ".html" || ext == ".htm") {
        if (want_text) extracted_text = html_extract_text(file_path);
    }
    // --- TXT / MD ---
    else if (ext == ".txt" || ext == ".md") {
        if (want_text) extracted_text = plaintext_extract(file_path);
    }

    // Collect new image paths
    auto image_paths = want_images ? collect_new_files(file_image_dir, before)
                                   : std::vector<std::string>{};

    // Generate thumbnails from extracted raw images
    std::vector<std::string> thumb_dirs;
    if (want_images) {
        for (size_t i = 0; i < image_paths.size(); i++) {
            std::string tdir = file_image_dir + "/thumbs_" + std::to_string(i);
            std::string prefix = base_name + "_img" + std::to_string(i);
            int written = generate_thumbnails_from_file(image_paths[i], tdir, prefix);
            if (written > 0) {
                thumb_dirs.push_back(tdir);
            } else {
                thumb_dirs.push_back("");
            }
        }
    }

    // Emit JSON result
    std::cout << "{\"success\":true";
    std::cout << ",\"file\":\"" << json_escape(file_path) << "\"";
    std::cout << ",\"file_type\":\"" << json_escape(ext) << "\"";
    if (want_text)
        std::cout << ",\"text\":\"" << json_escape(extracted_text) << "\"";
    if (want_images) {
        std::cout << ",\"image_count\":" << (int)image_paths.size();
        std::cout << ",\"images\":[";
        for (size_t i = 0; i < image_paths.size(); i++) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(image_paths[i]) << "\"";
        }
        std::cout << "]";
        std::cout << ",\"thumb_dirs\":[";
        for (size_t i = 0; i < thumb_dirs.size(); i++) {
            if (i) std::cout << ",";
            std::cout << "\"" << json_escape(thumb_dirs[i]) << "\"";
        }
        std::cout << "]";
    }
    std::cout << "}" << std::endl;
    return true;
}

// Extract candidate <img> src attributes from an HTML string using Gumbo.
// Returns up to max_results candidates in document order.
static std::vector<std::string> gumbo_find_img_srcs(const std::string &html_content,
                                                     int max_results = 5) {
    std::vector<std::string> results;
    GumboOutput *output = gumbo_parse(html_content.c_str());
    if (!output) return results;

    // BFS through the tree to find <img> tags
    std::vector<GumboNode*> stack;
    stack.push_back(output->root);

    while (!stack.empty() && (int)results.size() < max_results) {
        GumboNode *node = stack.back();
        stack.pop_back();

        if (node->type != GUMBO_NODE_ELEMENT) continue;

        if (node->v.element.tag == GUMBO_TAG_IMG) {
            GumboAttribute *src = gumbo_get_attribute(&node->v.element.attributes, "src");
            if (src && src->value && src->value[0] != '\0') {
                results.push_back(src->value);
            }
        }

        // Push children in reverse order for correct traversal
        GumboVector *children = &node->v.element.children;
        for (int i = (int)children->length - 1; i >= 0; i--) {
            stack.push_back(static_cast<GumboNode*>(children->data[i]));
        }
    }

    gumbo_destroy_output(&kGumboDefaultOptions, output);
    return results;
}

// Resolve an image from a ZIM archive by trying common path prefixes.
// Returns the item's data as a string, or empty string on failure.
// Sets out_mimetype to the resolved mimetype.
static std::string zim_resolve_image(zim::Archive &archive,
                                     const std::string &raw_path,
                                     std::string &out_mimetype) {
    // Candidates: direct, then common ZIM namespace prefixes
    std::vector<std::string> candidates = {raw_path};
    if (raw_path.size() > 0 && raw_path[0] != 'I' && raw_path[0] != '-')
        candidates.push_back("I/" + raw_path);
    if (raw_path.size() > 0 && raw_path[0] != '-')
        candidates.push_back("-/" + raw_path);
    if (raw_path.size() > 0 && raw_path[0] != 'A')
        candidates.push_back("A/" + raw_path);

    for (const auto &cand : candidates) {
        try {
            auto e = archive.getEntryByPath(cand);
            if (e.isRedirect()) e = e.getRedirectEntry();
            auto itm = e.getItem();
            std::string mt = itm.getMimetype();
            // Only extract images
            if (mt.find("image/") == std::string::npos) continue;
            auto blob = itm.getData();
            if (blob.size() < 100) continue;
            out_mimetype = mt;
            return std::string(blob.data(), blob.size());
        } catch (...) {
            continue;
        }
    }
    return "";
}

// Generate multi-size JPEG thumbnails from raw image data in memory.
// Writes 4 sizes (large 150, medium 300, small 100, modal 800) to out_dir.
// prefix is used in filenames: <prefix>_thumb_0_<size>.jpg
// Returns number of thumbnails written (0 on decode failure).
static int generate_thumbnails(const unsigned char *data, int data_len,
                               const std::string &out_dir,
                               const std::string &prefix) {
    int w, h, channels;
    unsigned char *img = stbi_load_from_memory(data, data_len, &w, &h, &channels, 0);
    if (!img) return 0;

    // Convert RGBA/GA to RGB by compositing onto white background
    unsigned char *rgb = nullptr;
    int rgb_channels = 3;
    if (channels == 4 || channels == 2) {
        rgb = (unsigned char *)malloc(w * h * 3);
        if (!rgb) { stbi_image_free(img); return 0; }
        for (int i = 0; i < w * h; i++) {
            unsigned char a = (channels == 4) ? img[i * 4 + 3] : img[i * 2 + 1];
            if (channels == 4) {
                rgb[i * 3 + 0] = (img[i * 4 + 0] * a + 255 * (255 - a)) / 255;
                rgb[i * 3 + 1] = (img[i * 4 + 1] * a + 255 * (255 - a)) / 255;
                rgb[i * 3 + 2] = (img[i * 4 + 2] * a + 255 * (255 - a)) / 255;
            } else {
                unsigned char gray = img[i * 2];
                unsigned char v = (gray * a + 255 * (255 - a)) / 255;
                rgb[i * 3 + 0] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v;
            }
        }
        stbi_image_free(img);
        img = rgb;
        rgb = nullptr;
        channels = 3;
    } else if (channels == 1) {
        // Grayscale → RGB
        rgb = (unsigned char *)malloc(w * h * 3);
        if (!rgb) { stbi_image_free(img); return 0; }
        for (int i = 0; i < w * h; i++) {
            rgb[i * 3 + 0] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = img[i];
        }
        stbi_image_free(img);
        img = rgb;
        rgb = nullptr;
        channels = 3;
    }

    struct ThumbSize { const char *name; int max_dim; };
    ThumbSize sizes[] = {
        {"large",  150},
        {"medium", 300},
        {"small",  100},
        {"modal",  800}
    };

    fs::create_directories(out_dir);
    int written = 0;

    for (auto &sz : sizes) {
        // Compute target dimensions maintaining aspect ratio (fit within box)
        int tw = sz.max_dim, th = sz.max_dim;
        if (w <= tw && h <= th) {
            tw = w; th = h; // don't upscale
        } else {
            float scale = std::min((float)tw / w, (float)th / h);
            tw = std::max(1, (int)(w * scale));
            th = std::max(1, (int)(h * scale));
        }

        unsigned char *resized = (unsigned char *)malloc(tw * th * 3);
        if (!resized) continue;

        stbir_resize_uint8_linear(img, w, h, w * channels,
                                  resized, tw, th, tw * 3,
                                  STBIR_RGB);

        std::string out_path = out_dir + "/" + prefix + "_thumb_0_" + sz.name + ".jpg";
        if (stbi_write_jpg(out_path.c_str(), tw, th, 3, resized, 85)) {
            written++;
        }
        free(resized);
    }

    stbi_image_free(img);
    return written;
}

// Generate thumbnails from a file on disk (for document extraction paths).
// Returns number of thumbnails written.
static int generate_thumbnails_from_file(const std::string &image_path,
                                         const std::string &out_dir,
                                         const std::string &prefix) {
    std::ifstream ifs(image_path, std::ios::binary | std::ios::ate);
    if (!ifs.good()) return 0;
    auto size = ifs.tellg();
    if (size < 100) return 0;
    ifs.seekg(0);
    std::vector<unsigned char> buf(size);
    ifs.read(reinterpret_cast<char *>(buf.data()), size);
    if (!ifs.good()) return 0;
    return generate_thumbnails(buf.data(), (int)buf.size(), out_dir, prefix);
}

// Generate multi-size JPEG thumbnails from SVG data using librsvg + cairo.
// Renders SVG at each target size, composites onto white background, writes JPEG.
// Returns number of thumbnails written (0 on failure).
static int generate_svg_thumbnails(const unsigned char *data, int data_len,
                                   const std::string &out_dir,
                                   const std::string &prefix) {
    if (data_len < 10) return 0;

    GError *error = nullptr;
    RsvgHandle *handle = rsvg_handle_new_from_data(data, data_len, &error);
    if (error || !handle) {
        if (error) g_error_free(error);
        return 0;
    }

    // Get intrinsic dimensions
    gdouble svg_w = 0, svg_h = 0;
    gboolean has_width, has_height, has_viewbox;
    RsvgLength w_len, h_len;
    RsvgRectangle viewbox;
    rsvg_handle_get_intrinsic_dimensions(handle, &has_width, &w_len,
                                         &has_height, &h_len,
                                         &has_viewbox, &viewbox);
    if (has_viewbox) {
        svg_w = viewbox.width;
        svg_h = viewbox.height;
    } else if (has_width && has_height) {
        svg_w = w_len.length;
        svg_h = h_len.length;
    }
    // Fallback: render at 800x800 and let librsvg figure it out
    if (svg_w <= 0 || svg_h <= 0) {
        svg_w = 800;
        svg_h = 800;
    }

    // Skip icon-sized SVGs — content diagrams/charts are typically 200+px,
    // while UI icons (home, search, arrows) are 16-48px.
    if (svg_w <= 64 && svg_h <= 64) {
        g_object_unref(handle);
        return 0;
    }

    struct ThumbSize { const char *name; int max_dim; };
    ThumbSize sizes[] = {
        {"large",  150},
        {"medium", 300},
        {"small",  100},
        {"modal",  800}
    };

    fs::create_directories(out_dir);
    int written = 0;

    for (auto &sz : sizes) {
        // Compute target dimensions maintaining aspect ratio
        int tw = sz.max_dim, th = sz.max_dim;
        if (svg_w <= tw && svg_h <= th) {
            tw = (int)svg_w;
            th = (int)svg_h;
        } else {
            double scale = std::min((double)tw / svg_w, (double)th / svg_h);
            tw = std::max(1, (int)(svg_w * scale));
            th = std::max(1, (int)(svg_h * scale));
        }

        // Create Cairo surface
        cairo_surface_t *surface = cairo_image_surface_create(
            CAIRO_FORMAT_ARGB32, tw, th);
        if (cairo_surface_status(surface) != CAIRO_STATUS_SUCCESS) {
            cairo_surface_destroy(surface);
            continue;
        }

        cairo_t *cr = cairo_create(surface);

        // White background
        cairo_set_source_rgb(cr, 1.0, 1.0, 1.0);
        cairo_paint(cr);

        // Scale and render SVG into the surface
        RsvgRectangle viewport = {0, 0, (double)tw, (double)th};
        rsvg_handle_render_document(handle, cr, &viewport, nullptr);

        cairo_surface_flush(surface);

        // Extract ARGB32 pixels and convert to RGB for JPEG
        unsigned char *cairo_data = cairo_image_surface_get_data(surface);
        int stride = cairo_image_surface_get_stride(surface);
        unsigned char *rgb = (unsigned char *)malloc(tw * th * 3);
        if (rgb) {
            for (int y = 0; y < th; y++) {
                unsigned char *row = cairo_data + y * stride;
                for (int x = 0; x < tw; x++) {
                    // Cairo ARGB32 is stored as BGRA in native byte order
                    unsigned char b = row[x * 4 + 0];
                    unsigned char g = row[x * 4 + 1];
                    unsigned char r = row[x * 4 + 2];
                    // Alpha already composited onto white background
                    rgb[(y * tw + x) * 3 + 0] = r;
                    rgb[(y * tw + x) * 3 + 1] = g;
                    rgb[(y * tw + x) * 3 + 2] = b;
                }
            }

            std::string out_path = out_dir + "/" + prefix + "_thumb_0_" + sz.name + ".jpg";
            if (stbi_write_jpg(out_path.c_str(), tw, th, 3, rgb, 85)) {
                written++;
            }
            free(rgb);
        }

        cairo_destroy(cr);
        cairo_surface_destroy(surface);
    }

    g_object_unref(handle);
    return written;
}

// Guess file extension from MIME type
static std::string ext_from_mime(const std::string &mime) {
    if (mime.find("jpeg") != std::string::npos) return ".jpg";
    if (mime.find("png")  != std::string::npos) return ".png";
    if (mime.find("gif")  != std::string::npos) return ".gif";
    if (mime.find("webp") != std::string::npos) return ".webp";
    if (mime.find("bmp")  != std::string::npos) return ".bmp";
    if (mime.find("tiff") != std::string::npos) return ".tiff";
    return ".bin";
}

// Thread-safe bounded queue for producer-consumer pattern
template<typename T>
class BoundedQueue {
    std::queue<T> q_;
    std::mutex mtx_;
    std::condition_variable cv_push_, cv_pop_;
    size_t capacity_;
    bool done_ = false;
public:
    explicit BoundedQueue(size_t cap) : capacity_(cap) {}
    bool push(T item) {
        std::unique_lock<std::mutex> lk(mtx_);
        cv_push_.wait(lk, [&]{ return q_.size() < capacity_ || done_; });
        if (done_) return false;
        q_.push(std::move(item));
        cv_pop_.notify_one();
        return true;
    }
    bool pop(T &item) {
        std::unique_lock<std::mutex> lk(mtx_);
        cv_pop_.wait(lk, [&]{ return !q_.empty() || done_; });
        if (q_.empty()) return false;
        item = std::move(q_.front());
        q_.pop();
        cv_push_.notify_one();
        return true;
    }
    void finish() {
        { std::lock_guard<std::mutex> lk(mtx_); done_ = true; }
        cv_pop_.notify_all();
        cv_push_.notify_all();
    }
};

struct ZimWorkItem {
    int seq;
    std::string article_path;
    std::string title;
    std::string html_content;
};

// Process a ZIM archive: iterate all HTML articles, extract text, emit JSONL.
// Uses a thread pool for parallel thumbnail generation.
// If img_out_dir is non-empty, also extract the first image per article to that directory.
void process_zim(const std::string &zim_path, int limit,
                 const std::string &img_out_dir) {
    zim::Archive archive(zim_path);
    bool extract_images = !img_out_dir.empty();

    if (extract_images) {
        fs::create_directories(img_out_dir);
    }

    auto all_entry_count = archive.getAllEntryCount();
    auto entry_count = archive.getEntryCount();
    auto article_count = archive.getArticleCount();
    std::cerr << "ZIM archive: " << all_entry_count << " all entries, "
              << entry_count << " user entries, "
              << article_count << " articles in " << zim_path << std::endl;

    // Determine worker thread count (auto-detect, leave 2 for main thread + OS)
    unsigned int num_threads = std::thread::hardware_concurrency();
    if (num_threads == 0) num_threads = 4;
    num_threads = std::max(2u, num_threads - 2);
    std::cerr << "Using " << num_threads << " worker threads for ZIM processing" << std::endl;

    // Shared atomic counters
    std::atomic<int> success{0}, worker_failed{0}, images_extracted{0};

    // Image dedup map (shared across workers)
    std::mutex dedup_mtx;
    std::unordered_map<std::string, int> img_usage_count;
    const int IMG_DEDUP_THRESHOLD = 3;

    // Stdout mutex for JSONL output
    std::mutex stdout_mtx;

    // Work queue — bounded to prevent memory explosion on large ZIMs
    BoundedQueue<ZimWorkItem> work_queue(num_threads * 4);

    // --- Worker function ---
    auto worker_fn = [&]() {
        ZimWorkItem item;
        while (work_queue.pop(item)) {
            try {
                std::string text = strip_html_tags(item.html_content);
                if (text.size() < 10) {
                    worker_failed++;
                    continue;
                }

                std::string image_path;
                std::string thumb_dir;
                std::string image_skipped;

                if (extract_images) {
                    auto img_candidates = gumbo_find_img_srcs(item.html_content, 5);

                    // Normalize all candidates
                    for (auto &cand : img_candidates) {
                        while (!cand.empty() && (cand[0] == '.' || cand[0] == '/'))
                            cand.erase(0, 1);
                    }

                    // Lambda to attempt thumbnailing a single candidate
                    auto try_candidate = [&](const std::string &cand) -> bool {
                        if (cand.empty()) return false;

                        // Skip paths that look like UI icons by filename
                        {
                            std::string lower_cand = cand;
                            std::transform(lower_cand.begin(), lower_cand.end(),
                                           lower_cand.begin(), ::tolower);
                            auto slash = lower_cand.rfind('/');
                            std::string fname = (slash != std::string::npos)
                                ? lower_cand.substr(slash + 1) : lower_cand;
                            if (fname.find("icon") != std::string::npos ||
                                fname.find("logo") != std::string::npos ||
                                fname.find("button") != std::string::npos ||
                                fname.find("arrow") != std::string::npos ||
                                fname.find("chevron") != std::string::npos ||
                                fname.find("badge") != std::string::npos ||
                                fname.find("favicon") != std::string::npos) {
                                if (image_skipped.empty()) image_skipped = "icon";
                                return false;
                            }
                        }

                        std::string img_mime;
                        std::string img_data = zim_resolve_image(archive, cand, img_mime);
                        if (img_data.empty()) {
                            if (image_skipped.empty()) image_skipped = "not_found";
                            return false;
                        }
                        if (img_mime.find("icon") != std::string::npos) {
                            if (image_skipped.empty()) image_skipped = "icon";
                            return false;
                        }

                        // Use seq number for unique directory naming (thread-safe)
                        std::string art_thumb_dir = img_out_dir + "/" + std::to_string(item.seq);
                        std::string prefix = std::to_string(item.seq);
                        int written = 0;

                        if (img_mime.find("svg") != std::string::npos ||
                            img_mime.find("xml") != std::string::npos) {
                            written = generate_svg_thumbnails(
                                reinterpret_cast<const unsigned char *>(img_data.data()),
                                (int)img_data.size(), art_thumb_dir, prefix);
                        } else {
                            written = generate_thumbnails(
                                reinterpret_cast<const unsigned char *>(img_data.data()),
                                (int)img_data.size(), art_thumb_dir, prefix);
                        }

                        if (written > 0) {
                            image_path = cand;
                            thumb_dir = art_thumb_dir;
                            images_extracted++;
                            image_skipped.clear();
                            {
                                std::lock_guard<std::mutex> lock(dedup_mtx);
                                img_usage_count[cand]++;
                            }
                            return true;
                        }
                        return false;
                    };

                    // Pass 1: prefer candidates not yet overused (skip banners/logos)
                    bool found = false;
                    for (const auto &cand : img_candidates) {
                        {
                            std::lock_guard<std::mutex> lock(dedup_mtx);
                            if (img_usage_count[cand] >= IMG_DEDUP_THRESHOLD) continue;
                        }
                        if (try_candidate(cand)) { found = true; break; }
                    }
                    // Pass 2: fall back to any working candidate (even repeated)
                    if (!found) {
                        for (const auto &cand : img_candidates) {
                            if (try_candidate(cand)) break;
                        }
                    }
                }

                // Emit JSONL (mutex-protected)
                {
                    std::lock_guard<std::mutex> lock(stdout_mtx);
                    std::cout << "{\"path\":\"" << json_escape(item.article_path)
                              << "\",\"title\":\"" << json_escape(item.title)
                              << "\",\"text\":\"" << json_escape(text)
                              << "\",\"image_path\":\"" << json_escape(image_path)
                              << "\",\"thumb_dir\":\"" << json_escape(thumb_dir)
                              << "\",\"image_skipped\":\"" << json_escape(image_skipped)
                              << "\",\"size\":" << item.html_content.size()
                              << "}" << std::endl;
                }

                success++;

            } catch (const std::exception &e) {
                worker_failed++;
                std::cerr << "  Error processing ZIM article: " << e.what() << std::endl;
            }
        }
    };

    // Start worker threads
    std::vector<std::thread> workers;
    workers.reserve(num_threads);
    for (unsigned int i = 0; i < num_threads; i++) {
        workers.emplace_back(worker_fn);
    }

    // --- Main thread: iterate ZIM and feed work queue ---
    std::map<std::string, int> mime_counts;
    int redirect_count = 0, skipped = 0, main_failed = 0;
    int total = 0, seq = 0;

    for (auto entry : archive.iterByPath()) {
        if (limit > 0 && total >= limit) break;

        try {
            if (entry.isRedirect()) {
                redirect_count++;
                skipped++;
                continue;
            }

            auto item = entry.getItem();
            std::string mimetype = item.getMimetype();

            // Track first 20 unique MIME types for diagnostics
            if (mime_counts.size() < 20 || mime_counts.count(mimetype)) {
                mime_counts[mimetype]++;
            }

            // Only process HTML articles
            if (mimetype.find("text/html") == std::string::npos) {
                skipped++;
                continue;
            }

            total++;
            std::string article_path = entry.getPath();
            std::string title = entry.getTitle();
            if (title.empty()) title = article_path;

            // Read article content
            auto blob = item.getData();
            std::string html_content(blob.data(), blob.size());

            if (html_content.empty()) {
                main_failed++;
                continue;
            }

            work_queue.push({seq++, std::move(article_path), std::move(title),
                           std::move(html_content)});

        } catch (const std::exception &e) {
            main_failed++;
            std::cerr << "  Error reading ZIM entry: " << e.what() << std::endl;
        }
    }

    // Signal workers that no more items are coming
    work_queue.finish();

    // Wait for all workers to complete
    for (auto &w : workers) w.join();

    int total_failed = main_failed + worker_failed.load();
    int total_success = success.load();
    int total_images = images_extracted.load();

    std::cerr << "ZIM complete: " << total_success << " articles extracted, "
              << total_images << " images saved, "
              << total_failed << " failed, " << skipped << " skipped ("
              << redirect_count << " redirects) out of "
              << (total + skipped) << " entries | "
              << num_threads << " threads" << std::endl;

    // Print MIME type distribution for diagnostics
    std::cerr << "MIME type distribution:" << std::endl;
    for (const auto &pair : mime_counts) {
        std::cerr << "  " << pair.first << ": " << pair.second << std::endl;
    }
}

void print_usage(const char *prog) {
    std::cerr << "Usage:\n"
              << "  Single file:\n"
              << "    " << prog << " <file> --text\n"
              << "    " << prog << " <file> --images <out_dir>\n"
              << "    " << prog << " <file> --all <out_dir>\n"
              << "  Batch directory:\n"
              << "    " << prog << " --batch <dir> --out <image_out_dir>\n"
              << "    " << prog << " --batch <dir> --text-only\n"
              << "  ZIM archive:\n"
              << "    " << prog << " --zim <path>\n"
              << "    " << prog << " --zim <path> --limit <N>\n"
              << "    " << prog << " --zim <path> --extract-images <dir>\n"
              << "\n"
              << "Output: JSON (single) or JSONL (batch/zim) to stdout.\n"
              << "Logs/errors go to stderr.\n";
}

int main(int argc, char *argv[]) {
    if (argc < 3) { print_usage(argv[0]); return 1; }

    // Parse arguments
    std::string file_path;
    std::string batch_dir;
    std::string image_out_dir;
    std::string zim_path;
    std::string zim_img_dir;
    std::string mode;  // "text", "images", "all", "batch", "batch-text", "zim"
    int zim_limit = 0; // 0 = no limit

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--text") {
            if (mode.empty()) mode = "text";
        } else if (arg == "--images" && i + 1 < argc) {
            mode = "images";
            image_out_dir = argv[++i];
        } else if (arg == "--all" && i + 1 < argc) {
            mode = "all";
            image_out_dir = argv[++i];
        } else if (arg == "--batch" && i + 1 < argc) {
            batch_dir = argv[++i];
            if (mode.empty()) mode = "batch";
        } else if (arg == "--out" && i + 1 < argc) {
            image_out_dir = argv[++i];
            if (mode == "batch" || mode.empty()) mode = "batch";
        } else if (arg == "--text-only") {
            mode = "batch-text";
        } else if (arg == "--zim" && i + 1 < argc) {
            mode = "zim";
            zim_path = argv[++i];
        } else if (arg == "--limit" && i + 1 < argc) {
            zim_limit = std::atoi(argv[++i]);
        } else if (arg == "--extract-images" && i + 1 < argc) {
            zim_img_dir = argv[++i];
        } else if (arg == "--help" || arg == "-h") {
            print_usage(argv[0]);
            return 0;
        } else if (file_path.empty() && arg[0] != '-') {
            file_path = arg;
        }
    }

    if (mode.empty()) { print_usage(argv[0]); return 1; }

    // --- ZIM mode: process archive and exit (no MuPDF needed) ---
    if (mode == "zim") {
        if (zim_path.empty() || !fs::exists(zim_path)) {
            std::cerr << "Error: ZIM file not found: " << zim_path << "\n";
            return 1;
        }
        try {
            process_zim(zim_path, zim_limit, zim_img_dir);
        } catch (const std::exception &e) {
            std::cerr << "Fatal ZIM error: " << e.what() << "\n";
            return 1;
        }
        return 0;
    }

    // Determine what to extract
    bool want_text   = (mode == "text" || mode == "all" || mode == "batch" || mode == "batch-text");
    bool want_images = (mode == "images" || mode == "all" || mode == "batch");

    if (want_images && image_out_dir.empty()) {
        std::cerr << "Error: image output directory required (--images <dir>, --all <dir>, or --out <dir>)\n";
        return 1;
    }

    // Initialize MuPDF context (shared across all files for batch efficiency)
    fz_context *ctx = fz_new_context(NULL, NULL, FZ_STORE_UNLIMITED);
    if (!ctx) {
        std::cerr << "Fatal: failed to create MuPDF context\n";
        return 1;
    }
    fz_register_document_handlers(ctx);

    int exit_code = 0;

    // --- Batch mode: process all files in a directory ---
    if (!batch_dir.empty()) {
        if (!fs::exists(batch_dir) || !fs::is_directory(batch_dir)) {
            std::cerr << "Error: batch directory not found: " << batch_dir << "\n";
            fz_drop_context(ctx);
            return 1;
        }

        if (want_images) fs::create_directories(image_out_dir);

        int total = 0, success = 0, skipped = 0, failed = 0;

        for (const auto &entry : fs::recursive_directory_iterator(batch_dir)) {
            if (!entry.is_regular_file()) continue;

            std::string ext = normalize_ext(entry.path().extension().string());
            if (!is_supported(ext)) {
                skipped++;
                continue;
            }

            total++;
            std::string fpath = entry.path().string();

            // Per-file image subdirectory to avoid filename collisions
            std::string per_file_image_dir = image_out_dir;
            if (want_images && !image_out_dir.empty()) {
                // Use stem of file to create a unique subdirectory
                per_file_image_dir = image_out_dir + "/" + entry.path().stem().string();
                fs::create_directories(per_file_image_dir);
            }

            // Each line is a JSON object (JSONL format)
            if (process_file(fpath, want_text, want_images, per_file_image_dir, ctx)) {
                success++;
            } else {
                failed++;
            }
        }

        // Summary line to stderr
        std::cerr << "Batch complete: " << success << " succeeded, "
                  << failed << " failed, " << skipped << " skipped out of "
                  << (total + skipped) << " files\n";
    }
    // --- Single file mode ---
    else {
        if (file_path.empty()) {
            std::cerr << "Error: file path required\n";
            print_usage(argv[0]);
            fz_drop_context(ctx);
            return 1;
        }

        if (!process_file(file_path, want_text, want_images, image_out_dir, ctx)) {
            exit_code = 1;
        }
    }

    fz_drop_context(ctx);
    return exit_code;
}