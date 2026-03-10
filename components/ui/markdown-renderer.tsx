"use client";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import TaxonomyLink from "@/components/chat/taxonomy-link";

interface MarkdownRendererProps {
  children: string;
  components?: Record<string, any>;
  externalLinksNewTab?: boolean;
  linkClassName?: string;
}

export default function MarkdownRenderer({
  children,
  components,
  externalLinksNewTab = false,
  linkClassName,
}: MarkdownRendererProps) {
  const { a: customAnchor, ...restComponents } = components || {};

  const mergedComponents = {
    ...restComponents,
    a: ({ href, children, ...props }: any) => {
      if (href?.startsWith("taxonomy:")) {
        const id = parseInt(href.replace("taxonomy:", ""), 10);
        if (!isNaN(id)) {
          return <TaxonomyLink id={id}>{children}</TaxonomyLink>;
        }
      }

      if (customAnchor) {
        return customAnchor({ href, children, ...props });
      }

      if (externalLinksNewTab) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
            {...props}
          >
            {children}
          </a>
        );
      }

      return (
        <a href={href} className={linkClassName} {...props}>
          {children}
        </a>
      );
    },
  };

  return (
    <ReactMarkdown
      urlTransform={(url) => {
        if (url.startsWith("taxonomy:")) return url;
        return defaultUrlTransform(url);
      }}
      components={mergedComponents}
    >
      {children}
    </ReactMarkdown>
  );
}
