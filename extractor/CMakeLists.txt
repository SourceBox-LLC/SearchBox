cmake_minimum_required(VERSION 3.10)
project(DocExtractor)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find MuPDF (you'll need to install this)
find_package(PkgConfig REQUIRED)
pkg_check_modules(MUPDF REQUIRED mupdf)
pkg_check_modules(LIBZIM REQUIRED libzim)
pkg_check_modules(RSVG REQUIRED librsvg-2.0)
pkg_check_modules(CAIRO REQUIRED cairo)

# Add executable
add_executable(doc_extractor src/main.cpp)

# Link MuPDF, libzim, and all dependencies
target_include_directories(doc_extractor PRIVATE ${MUPDF_INCLUDE_DIRS} ${LIBZIM_INCLUDE_DIRS} ${RSVG_INCLUDE_DIRS} ${CAIRO_INCLUDE_DIRS})
target_link_libraries(doc_extractor
    mupdf
    mupdf-third
    mujs
    gumbo
    jbig2dec
    harfbuzz
    freetype
    openjp2
    jpeg
    zip
    pugixml
    ${LIBZIM_LIBRARIES}
    ${RSVG_LIBRARIES}
    ${CAIRO_LIBRARIES}
    z
    m
    pthread
)