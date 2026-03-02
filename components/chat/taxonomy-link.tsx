"use client";

import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { usePathname, useRouter } from "next/navigation";
import { Chip } from "@heroui/chip";
import { setSelectedFilters } from "@/lib/redux/slices/querySlice";
import type { RootState } from "@/lib/redux/store";

interface TaxonomyLinkProps {
  id: number;
  children: React.ReactNode;
}

export default function TaxonomyLink({ id, children }: TaxonomyLinkProps) {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const selectedFilters = useSelector(
    (state: RootState) => state.query.selectedFilters
  );
  const isSelected = selectedFilters.includes(id);
  const isOnBrowse = pathname === "/browse";

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isOnBrowse) {
        if (isSelected) {
          dispatch(setSelectedFilters(selectedFilters.filter((f) => f !== id)));
        } else {
          dispatch(setSelectedFilters([...selectedFilters, id]));
        }
      } else {
        dispatch(setSelectedFilters([...selectedFilters, id]));
        router.push("/browse");
      }
    },
    [id, isOnBrowse, isSelected, selectedFilters, dispatch, router]
  );

  return (
    <Chip
      as="span"
      size="sm"
      variant="flat"
      color="primary"
      className="cursor-pointer no-underline"
      onClick={handleClick}
    >
      {children}
    </Chip>
  );
}
