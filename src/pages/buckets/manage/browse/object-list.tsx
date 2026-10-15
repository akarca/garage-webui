import { Alert, Checkbox, Loading, Table } from "react-daisyui";
import { useBrowseObjects, useDeleteObject, useFolderSize } from "./hooks";
import { dayjs, handleError, readableBytes } from "@/lib/utils";
import mime from "mime/lite";
import { Object } from "./types";
import { API_URL } from "@/lib/api";
import {
  CircleXIcon,
  FileArchive,
  FileIcon,
  FileType,
  Folder,
  Trash,
} from "lucide-react";
import { useBucketContext } from "../context";
import ObjectActions from "./object-actions";
import GotoTopButton from "@/components/ui/goto-top-btn";
import Button from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Props = {
  prefix?: string;
  onPrefixChange?: (prefix: string) => void;
};

const ObjectList = ({ prefix, onPrefixChange }: Props) => {
  const { bucketName } = useBucketContext();
  const { data, error, isLoading } = useBrowseObjects(bucketName, {
    prefix,
    limit: 1000,
  });
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const deleteObject = useDeleteObject(bucketName);

  const allKeys = useMemo(
    () => [
      ...(data?.prefixes || []),
      ...(data?.objects || []).map((o) => data!.prefix + o.objectKey),
    ],
    [data]
  );
  const selectedKeys = allKeys.filter((key) => selected.has(key));
  const isAllSelected =
    allKeys.length > 0 && selectedKeys.length === allKeys.length;

  useEffect(() => {
    setSelected(new Set());
  }, [prefix]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(isAllSelected ? new Set() : new Set(allKeys));
  };

  const onDeleteSelected = async () => {
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedKeys.length} selected item(s)? Selected directories will be deleted with their content.`
      )
    ) {
      return;
    }

    const results = await Promise.allSettled(
      selectedKeys.map((key) =>
        deleteObject.mutateAsync({ key, recursive: key.endsWith("/") })
      )
    );
    const failed = results.filter((r) => r.status === "rejected");

    if (failed.length) {
      handleError((failed[0] as PromiseRejectedResult).reason);
    }
    if (failed.length < results.length) {
      toast.success(`${results.length - failed.length} item(s) deleted!`);
    }

    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["browse", bucketName] });
  };

  const onObjectClick = (object: Object) => {
    window.open(API_URL + object.url + "?view=1", "_blank");
  };

  return (
    <div className="overflow-x-auto min-h-[400px]">
      {selectedKeys.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-base-200">
          <span className="text-sm">{selectedKeys.length} selected</span>
          <Button
            icon={Trash}
            color="error"
            size="sm"
            onClick={onDeleteSelected}
            loading={deleteObject.isPending}
            disabled={deleteObject.isPending}
          >
            Delete Selected
          </Button>
        </div>
      )}

      <Table>
        <Table.Head>
          <Checkbox
            size="sm"
            className="align-middle"
            checked={isAllSelected}
            ref={(el) => {
              if (el) {
                el.indeterminate = selectedKeys.length > 0 && !isAllSelected;
              }
            }}
            disabled={!allKeys.length}
            onChange={toggleSelectAll}
            aria-label="Select all"
          />
          <span>Name</span>
          <span>Size</span>
          <span>Last Modified</span>
        </Table.Head>

        <Table.Body>
          {isLoading ? (
            <tr>
              <td colSpan={5}>
                <div className="h-[320px] flex items-center justify-center">
                  <Loading />
                </div>
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={5}>
                <Alert status="error" icon={<CircleXIcon />}>
                  <span>{error.message}</span>
                </Alert>
              </td>
            </tr>
          ) : !data?.prefixes?.length && !data?.objects?.length ? (
            <tr>
              <td className="text-center py-16" colSpan={5}>
                No objects
              </td>
            </tr>
          ) : null}

          {data?.prefixes.map((prefix) => (
            <tr
              key={prefix}
              className="hover:bg-neutral/60 hover:text-neutral-content group"
            >
              <td className="w-0">
                <Checkbox
                  size="sm"
                  className="align-middle"
                  checked={selected.has(prefix)}
                  onChange={() => toggleSelect(prefix)}
                />
              </td>
              <td
                className="cursor-pointer"
                role="button"
                onClick={() => onPrefixChange?.(prefix)}
              >
                <span className="flex items-center gap-2 font-normal">
                  <Folder size={20} className="text-primary" />
                  {prefix
                    .substring(0, prefix.lastIndexOf("/"))
                    .split("/")
                    .pop()}
                </span>
              </td>
              <FolderSizeCell bucket={bucketName} prefix={prefix} />
              <td />
              <ObjectActions object={{ objectKey: prefix, url: "" }} />
            </tr>
          ))}

          {data?.objects.map((object, idx) => {
            const extIdx = object.objectKey.lastIndexOf(".");
            const filename =
              extIdx >= 0
                ? object.objectKey.substring(0, extIdx)
                : object.objectKey;
            const ext = extIdx >= 0 ? object.objectKey.substring(extIdx) : null;
            const key = data.prefix + object.objectKey;

            return (
              <tr
                key={object.objectKey}
                className="hover:bg-neutral/60 hover:text-neutral-content group"
              >
                <td className="w-0">
                  <Checkbox
                    size="sm"
                    className="align-middle"
                    checked={selected.has(key)}
                    onChange={() => toggleSelect(key)}
                  />
                </td>
                <td
                  className="cursor-pointer"
                  role="button"
                  onClick={() => onObjectClick(object)}
                >
                  <span className="flex items-center font-normal w-full">
                    <FilePreview ext={ext?.substring(1)} object={object} />
                    <span className="truncate max-w-[40vw]">{filename}</span>
                    {ext && <span className="text-base-content/60">{ext}</span>}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  {readableBytes(object.size)}
                </td>
                <td className="whitespace-nowrap">
                  {dayjs(object.lastModified).fromNow()}
                </td>
                <ObjectActions
                  prefix={data.prefix}
                  object={object}
                  end={
                    idx >= data.objects.length - 2 && data.objects.length > 5
                  }
                />
              </tr>
            );
          })}
        </Table.Body>
      </Table>

      <GotoTopButton />
    </div>
  );
};

type FolderSizeCellProps = {
  bucket: string;
  prefix: string;
};

const FolderSizeCell = ({ bucket, prefix }: FolderSizeCellProps) => {
  const { data, isLoading } = useFolderSize(bucket, prefix);

  return (
    <td
      className="whitespace-nowrap"
      title={data ? `${data.objects} object(s)` : undefined}
    >
      {isLoading ? (
        <Loading size="xs" className="opacity-50" />
      ) : data ? (
        readableBytes(data.size)
      ) : (
        "-"
      )}
    </td>
  );
};

type FilePreviewProps = {
  ext?: string | null;
  object: Object;
};

const FilePreview = ({ ext, object }: FilePreviewProps) => {
  const type = mime.getType(ext || "")?.split("/")[0];
  let Icon = FileIcon;

  if (
    ["zip", "rar", "7z", "iso", "tar", "gz", "bz2", "xz"].includes(ext || "")
  ) {
    Icon = FileArchive;
  }

  if (type === "image") {
    const thumbnailSupport = ["jpg", "jpeg", "png", "gif"].includes(ext || "");
    return (
      <img
        src={API_URL + object.url + (thumbnailSupport ? "?thumb=1" : "?view=1")}
        alt={object.objectKey}
        className="size-5 object-cover overflow-hidden mr-2"
      />
    );
  }

  if (type === "text") {
    Icon = FileType;
  }

  return (
    <Icon
      size={20}
      className="text-base-content/60 group-hover:text-neutral-content/80 mr-2"
    />
  );
};

export default ObjectList;
