#!/usr/bin/env python3
"""
Download random Wikipedia articles as PDFs
Saves to: /home/sbussiso/Desktop/wikipedia articles/
"""

import requests
import os
from pathlib import Path
import time
import re

# Configuration
OUTPUT_DIR = Path("/home/sbussiso/Desktop/wikipedia articles")
NUM_ARTICLES = 100
DELAY_BETWEEN_REQUESTS = 1  # seconds, to be respectful to Wikipedia servers

def sanitize_filename(title):
    """Remove characters that aren't valid in filenames"""
    # Replace invalid characters with underscores
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', title)
    # Limit length to avoid filesystem issues
    return sanitized[:200]

def get_random_article():
    """Get a random Wikipedia article title and URL"""
    url = "https://en.wikipedia.org/api/rest_v1/page/random/summary"
    headers = {
        'User-Agent': 'WikipediaRandomDownloader/1.0 (Educational/Personal use)'
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        return {
            'title': data['title'],
            'url': data['content_urls']['desktop']['page']
        }
    except Exception as e:
        print(f"Error fetching random article: {e}")
        return None

def download_as_pdf(article_url, output_path):
    """Download Wikipedia article as PDF"""
    # Wikipedia's PDF export feature
    pdf_url = article_url.replace('/wiki/', '/api/rest_v1/page/pdf/')
    headers = {
        'User-Agent': 'WikipediaRandomDownloader/1.0 (Educational/Personal use)'
    }
    
    try:
        response = requests.get(pdf_url, headers=headers, timeout=30)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            f.write(response.content)
        return True
    except Exception as e:
        print(f"Error downloading PDF: {e}")
        return False

def main():
    # Create output directory if it doesn't exist
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Saving PDFs to: {OUTPUT_DIR}")
    print(f"Downloading {NUM_ARTICLES} random Wikipedia articles...\n")
    
    successful = 0
    failed = 0
    
    for i in range(NUM_ARTICLES):
        print(f"[{i+1}/{NUM_ARTICLES}] ", end="")
        
        # Get random article
        article = get_random_article()
        if not article:
            print("Failed to fetch random article")
            failed += 1
            continue
        
        title = article['title']
        url = article['url']
        print(f"Downloading: {title}")
        
        # Create safe filename
        safe_title = sanitize_filename(title)
        output_path = OUTPUT_DIR / f"{safe_title}.pdf"
        
        # Skip if already exists
        if output_path.exists():
            print(f"  → Already exists, skipping")
            continue
        
        # Download PDF
        if download_as_pdf(url, output_path):
            successful += 1
            file_size = output_path.stat().st_size / 1024  # KB
            print(f"  → Success! ({file_size:.1f} KB)")
        else:
            failed += 1
            print(f"  → Failed")
        
        # Be respectful to Wikipedia servers
        if i < NUM_ARTICLES - 1:
            time.sleep(DELAY_BETWEEN_REQUESTS)
    
    print(f"\n{'='*50}")
    print(f"Download complete!")
    print(f"Successful: {successful}")
    print(f"Failed: {failed}")
    print(f"Total files in directory: {len(list(OUTPUT_DIR.glob('*.pdf')))}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()